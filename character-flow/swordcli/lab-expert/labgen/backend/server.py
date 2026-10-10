"""
FastAPI Backend for LabGen IDE
Handles report generation, verification, and WebSocket communication with stage-based pipeline tracking
"""

import asyncio
import json
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Security, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

# Import LabGen modules
import sys
sys.path.append(str(Path(__file__).parent.parent))

from pipeline.verify import run_all_checks, extract_features, load_classifier, predict_classifier

class ThreadLogCapture:
    def __init__(self):
        import sys
        self.old_stdout = sys.stdout
        self.old_stderr = sys.stderr
        self.callbacks = {}
        
    def write(self, data):
        import threading
        tid = threading.get_ident()
        if tid in self.callbacks:
            if data.strip():
                self.callbacks[tid](data)
        else:
            self.old_stdout.write(data)
            
    def flush(self):
        self.old_stdout.flush()
        self.old_stderr.flush()

import sys
log_capture = ThreadLogCapture()
sys.stdout = log_capture
sys.stderr = log_capture

# Fix logging to use dynamic sys.stdout
import logging
for handler in logging.getLogger().handlers:
    handler.stream = sys.stdout

class DummyArgs:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)



# Intervention state management
intervention_events: Dict[str, asyncio.Event] = {}
intervention_actions: Dict[str, str] = {}

PROGRESS_STAGES = {
    "initializing rag": (20, 10),
    "running langgraph": (40, 10),
    "executing dynamic circuit": (60, 10),
    "assembling latex": (80, 10),
    "running verification": (90, 5),
    "done": (100, 0),
}

# Pipeline stage definitions
PIPELINE_STAGES = [
    {"id": "heuristic", "name": "Heuristic Gating", "description": "LightGBM classification confidence"},
    {"id": "physics", "name": "Physics Simulation", "description": "ngspice solver iterations"},
    {"id": "cad", "name": "CAD Compilation", "description": "CadQuery script to STEP/FCStd"},
    {"id": "report", "name": "Report Synthesis", "description": "LLM formatting results"},
]

app = FastAPI(title="LabGen IDE API", version="3.0.0")

# Rate Limiter Middleware
class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.clients = defaultdict(lambda: {"count": 0, "reset_at": time.time() + window_seconds})

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/"):
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()
            
            client_data = self.clients[client_ip]
            if now > client_data["reset_at"]:
                client_data["count"] = 0
                client_data["reset_at"] = now + self.window_seconds
                
            if client_data["count"] >= self.max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Please try again later."}
                )
                
            client_data["count"] += 1
            
        return await call_next(request)

app.add_middleware(SimpleRateLimitMiddleware, max_requests=100, window_seconds=60)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(json.dumps(message))
            except:
                pass
    
    async def broadcast(self, message: dict):
        for ws in self.active_connections.values():
            try:
                await ws.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()
report_run_dirs = {}

# Data models
class GenerateRequest(BaseModel):
    experimentName: str
    circuitPrompt: str = ""
    experimentNumber: int = 2
    studentName: str = "John Doe"
    rollNumber: str = "1901000"
    section: str = "A"
    group: int = 1
    cadPrompt: str = ""
    fluidsimPrompt: str = ""

class VerifyRequest(BaseModel):
    reportPath: str
    experimentName: str
    dataPath: Optional[str] = None

class ReportInfo(BaseModel):
    id: str
    name: str
    experiment: str
    status: str
    progress: int
    createdAt: str
    path: Optional[str] = None
    verification: Optional[dict] = None

# Load settings
from pipeline.config import load_settings, save_settings
settings = load_settings()

# API Key Authentication
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def verify_api_key(api_key: Optional[str]):
    if not api_key:
        return False
    # Get API key from settings (llm.api_key) or environment
    valid_key = settings.get("llm", {}).get("api_key") or os.environ.get("LABGEN_API_KEY", "dev-secret-key")
    return api_key == valid_key

def get_api_key(api_key_header: Optional[str] = Security(api_key_header)):
    if verify_api_key(api_key_header):
        return api_key_header
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API Key",
    )

api_key_dep = Depends(get_api_key)

# Load classifier
classifier, feature_names = None, None
if settings.get("verification", {}).get("enabled"):
    classifier_path = Path(__file__).parent.parent / settings["verification"]["classifier_path"]
    feature_names_path = Path(__file__).parent.parent / settings["verification"]["feature_names_path"]
    if classifier_path.exists() and feature_names_path.exists():
        classifier, feature_names = load_classifier(str(classifier_path), str(feature_names_path))

class WSPayload(BaseModel):
    type: str
    reportId: Optional[str] = None
    payload: Optional[GenerateRequest] = None

class InterventionResponse(BaseModel):
    reportId: str
    stage: str
    action: str  # "retry" | "skip" | "abort"
    params: Optional[dict] = None

# WebSocket endpoint
from fastapi import Query
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, api_key: str = Query(None)):
    from pydantic import ValidationError
    if not verify_api_key(api_key):
        await websocket.close(code=1008)
        return
    client_id = str(uuid.uuid4())
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg_dict = json.loads(data)
                msg = WSPayload(**msg_dict)
                if msg.type == "generate":
                    report_id = msg.reportId or f"report_{uuid.uuid4().hex[:8]}"
                    params = msg.payload.model_dump() if msg.payload else {}
                    asyncio.create_task(run_generation_with_progress(websocket, report_id, params))
                elif msg.type == "intervention_response":
                    report_id = msg.reportId
                    if report_id in intervention_events:
                        intervention_actions[report_id] = msg.action
                        intervention_events[report_id].set()
            except json.JSONDecodeError:
                pass
            except ValidationError as e:
                await websocket.send_text(json.dumps({"type": "error", "message": f"Validation error: {e}"}))
    except WebSocketDisconnect:
        manager.disconnect(client_id)

# REST endpoints
@app.get("/api/health")
async def health_check():
    import shutil
    from pipeline.config import get_api_key
    
    services = {
        "labgen": "ready",
        "verification": "ready" if classifier else "disabled",
        "freecad": "ready" if shutil.which("freecadcmd") else "missing",
        "ngspice": "ready" if shutil.which("ngspice") else "missing",
        "pdflatex": "ready" if shutil.which("pdflatex") else "missing",
        "api_key": "configured" if get_api_key() else "missing",
    }
    
    status = "healthy" if all(v in ["ready", "disabled", "configured"] for v in services.values()) else "degraded"
    
    return {
        "status": status,
        "version": "3.0.0",
        "services": services
    }

@app.get("/api/reports", response_model=List[ReportInfo], dependencies=[api_key_dep])
async def list_reports():
    runs_dir = Path(__file__).parent.parent / "runs"
    reports = []
    if runs_dir.exists():
        for run_dir in sorted(runs_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if run_dir.is_dir():
                verification_path = run_dir / "verification_report.json"
                verification = None
                if verification_path.exists():
                    with open(verification_path) as f:
                        verification = json.load(f)
                
                pdf_files = list(run_dir.glob("*.pdf"))
                pdf_path = str(pdf_files[0]) if pdf_files else None
                
                status_val = "complete"
                if not pdf_path:
                    status_val = "error"
                
                reports.append(ReportInfo(
                    id=run_dir.name,
                    name=run_dir.name.replace("_", " ").replace("exp_", "EXP ").replace("analyzing_", "").replace("triac_", "TRIAC ").replace("characteristics", "CHARACTERISTICS").title(),
                    experiment=run_dir.name,
                    status=status_val,
                    progress=100,
                    createdAt=datetime.fromtimestamp(run_dir.stat().st_mtime).isoformat(),
                    path=pdf_path,
                    verification=verification.get("summary") if verification else None
                ))
    return reports

@app.post("/api/generate", dependencies=[api_key_dep])
async def generate_report(request: GenerateRequest, background_tasks: BackgroundTasks):
    report_id = f"report_{uuid.uuid4().hex[:8]}"
    return {
        "reportId": report_id,
        "status": "started",
        "message": "Report generation initiated"
    }

@app.websocket("/ws/generate/{report_id}")
async def generate_websocket(websocket: WebSocket, report_id: str, api_key: str = Query(None)):
    if not verify_api_key(api_key):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        params = json.loads(data)
        await run_generation_with_progress(websocket, report_id, params)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "reportId": report_id,
            "message": str(e)
        }))
    finally:
        try:
            await websocket.close()
        except:
            pass

async def emit_stage_event(websocket: WebSocket, report_id: str, event_type: str, stage: str, data: dict = None):
    """Emit a pipeline stage event"""
    message = {
        "type": event_type,
        "reportId": report_id,
        "stage": stage,
        "timestamp": datetime.now().isoformat(),
    }
    if data:
        message.update(data)
    await websocket.send_text(json.dumps(message))


async def run_generation_with_progress(websocket: WebSocket, report_id: str, params: dict):
    """Run the actual LabGen generation with stage-based progress updates"""
    import asyncio
    import os
    import json
    import threading
    import sys
    from main import run_generation
    
    try:
        exp_name = params.get("experimentName", "Test Experiment")
        exp_num = str(params.get("experimentNumber", 2))
        circuit_prompt = params.get("circuitPrompt", "")
        cad_prompt = params.get("cadPrompt", "")
        fluidsim_prompt = params.get("fluidsimPrompt", "")
        cad_requested = bool(cad_prompt)
        fluidsim_requested = bool(fluidsim_prompt)
        
        args = DummyArgs(
            name=exp_name,
            exp=exp_num,
            circuit_prompt=circuit_prompt,
            cad_prompt=cad_prompt,
            fluidsim_prompt=fluidsim_prompt
        )
        
        # Stage 1: Heuristic Gating
        await emit_stage_event(websocket, report_id, "stage_start", "heuristic", {
            "message": "Initializing heuristic gating...",
            "progress": 0
        })
        
        labgen_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        current_stage = "heuristic"
        stage_progress = {"heuristic": 0, "physics": 0, "cad": 0, "report": 0}
        assets = []
        stage_started = {"heuristic": False, "physics": False, "cad": False, "report": False}
        
        stage_started["heuristic"] = True
        
        # Thread-safe queue for logs
        import queue
        log_queue = queue.Queue()
        
        def log_callback(data):
            log_queue.put(data)
            
        def worker():
            tid = threading.get_ident()
            log_capture.callbacks[tid] = log_callback
            try:
                run_generation(args, settings)
            finally:
                if tid in log_capture.callbacks:
                    del log_capture.callbacks[tid]
                log_queue.put(None) # Sentinel

        # Start worker thread
        worker_task = asyncio.create_task(asyncio.to_thread(worker))
        
        while True:
            try:
                # get_nowait to not block asyncio loop
                line_str = log_queue.get_nowait()
                if line_str is None:
                    break
            except queue.Empty:
                await asyncio.sleep(0.1)
                if worker_task.done():
                    # Process remaining logs
                    while not log_queue.empty():
                        line_str = log_queue.get()
                        if line_str is None:
                            break
                        # (We could parse logs here too, but for simplicity we'll just ignore or run one last parse block)
                    break
                continue
                
            line_str = line_str.strip()
            if not line_str:
                continue
            
            line_lower = line_str.lower()
            
            # Detect stage transitions from log output
            if "initializing rag" in line_lower or "building rag" in line_lower:
                if current_stage != "heuristic":
                    await emit_stage_event(websocket, report_id, "stage_complete", current_stage, {"progress": 100})
                    current_stage = "heuristic"
                    await emit_stage_event(websocket, report_id, "stage_start", "heuristic", {"progress": 0})
                    stage_started["heuristic"] = True
                stage_progress["heuristic"] = min(100, stage_progress["heuristic"] + 10)
                await emit_stage_event(websocket, report_id, "stage_progress", "heuristic", {
                    "progress": stage_progress["heuristic"],
                    "log": line_str
                })
                
            elif "running langgraph" in line_lower or "langgraph pipeline" in line_lower:
                if current_stage != "heuristic":
                    await emit_stage_event(websocket, report_id, "stage_complete", current_stage, {"progress": 100})
                    current_stage = "heuristic"
                    await emit_stage_event(websocket, report_id, "stage_start", "heuristic", {"progress": stage_progress["heuristic"]})
                    stage_started["heuristic"] = True
                stage_progress["heuristic"] = min(100, stage_progress["heuristic"] + 15)
                await emit_stage_event(websocket, report_id, "stage_progress", "heuristic", {
                    "progress": stage_progress["heuristic"],
                    "log": line_str
                })
                
            elif "executing dynamic circuit" in line_lower or "ngspice" in line_lower or "simulation" in line_lower:
                if current_stage != "physics":
                    await emit_stage_event(websocket, report_id, "stage_complete", current_stage, {"progress": 100})
                    current_stage = "physics"
                    await emit_stage_event(websocket, report_id, "stage_start", "physics", {"progress": 0})
                    stage_started["physics"] = True
                stage_progress["physics"] = min(100, stage_progress["physics"] + 12)
                await emit_stage_event(websocket, report_id, "stage_progress", "physics", {
                    "progress": stage_progress["physics"],
                    "log": line_str
                })
                
            elif cad_requested and ("freecad" in line_lower or "design_cad" in line_lower or "cad_agent" in line_lower or "step file" in line_lower or "creating cad" in line_lower or "cadquery" in line_lower):
                if current_stage != "cad":
                    await emit_stage_event(websocket, report_id, "stage_complete", current_stage, {"progress": 100})
                    current_stage = "cad"
                    await emit_stage_event(websocket, report_id, "stage_start", "cad", {"progress": 0})
                    stage_started["cad"] = True
                stage_progress["cad"] = min(100, stage_progress["cad"] + 15)
                await emit_stage_event(websocket, report_id, "stage_progress", "cad", {
                    "progress": stage_progress["cad"],
                    "log": line_str
                })
                
            elif "assembling latex" in line_lower or "rendering latex" in line_lower or "compiling pdf" in line_lower or "compile_pdf" in line_lower:
                if current_stage != "report":
                    await emit_stage_event(websocket, report_id, "stage_complete", current_stage, {"progress": 100})
                    current_stage = "report"
                    await emit_stage_event(websocket, report_id, "stage_start", "report", {"progress": 0})
                    stage_started["report"] = True
                stage_progress["report"] = min(100, stage_progress["report"] + 15)
                await emit_stage_event(websocket, report_id, "stage_progress", "report", {
                    "progress": stage_progress["report"],
                    "log": line_str
                })
                
            elif "running verification" in line_lower or "lightgbm" in line_lower or "verification" in line_lower:
                if current_stage != "report":
                    await emit_stage_event(websocket, report_id, "stage_complete", current_stage, {"progress": 100})
                    current_stage = "report"
                    await emit_stage_event(websocket, report_id, "stage_start", "report", {"progress": stage_progress["report"]})
                    stage_started["report"] = True
                stage_progress["report"] = min(100, stage_progress["report"] + 10)
                await emit_stage_event(websocket, report_id, "stage_progress", "report", {
                    "progress": stage_progress["report"],
                    "log": line_str
                })
                
            elif "error" in line_lower and "validation error" not in line_lower and "error executing" not in line_lower:
                await websocket.send_text(json.dumps({
                    "type": "stage_error",
                    "reportId": report_id,
                    "stage": current_stage,
                    "error": line_str,
                    "recoverable": True
                }))
            
            else:
                if current_stage in stage_progress:
                    stage_progress[current_stage] = min(100, stage_progress[current_stage] + 2)
                    await emit_stage_event(websocket, report_id, "stage_progress", current_stage, {
                        "progress": stage_progress[current_stage],
                        "log": line_str
                    })
            
            await websocket.send_text(json.dumps({
                "type": "log",
                "reportId": report_id,
                "stage": current_stage,
                "content": line_str
            }))
            
        await worker_task
            
        # Complete all stages that were started
        stage_order = ["heuristic", "physics", "cad", "report"]
        for stage in stage_order:
            if stage_started.get(stage) or stage in ["heuristic", "physics", "report"]:
                if stage_progress[stage] < 100:
                    stage_progress[stage] = 100
                    await emit_stage_event(websocket, report_id, "stage_progress", stage, {"progress": 100})
                await emit_stage_event(websocket, report_id, "stage_complete", stage, {"progress": 100})
            elif stage == "cad" and not cad_requested:
                stage_progress[stage] = 100
                await emit_stage_event(websocket, report_id, "stage_progress", stage, {"progress": 100})
                await emit_stage_event(websocket, report_id, "stage_complete", stage, {"progress": 100, "skipped": True})
        
        # Collect assets (always try, even if some stages had issues)
        safe_name = exp_name.lower().replace(" ", "_")
        runs_parent = Path(labgen_dir) / "runs"
        run_dir = runs_parent / safe_name
        if not run_dir.exists():
            candidates = list(runs_parent.glob(f"*{safe_name[:12]}*"))
            if candidates:
                run_dir = sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[0]
            else:
                run_dir = runs_parent / f"exp_{exp_num.zfill(2)}_{safe_name}"
        
        # Register run directory for report_id
        report_run_dirs[report_id] = run_dir
        
        if run_dir.exists():
            pdf_files = list(run_dir.glob("*.pdf"))
            if pdf_files:
                assets.append({"type": "pdf", "path": str(pdf_files[0]), "label": "PDF Report"})
            
            fcstd_files = list(run_dir.glob("*.FCStd")) + list(run_dir.glob("*.step")) + list(run_dir.glob("*.stl"))
            if fcstd_files:
                assets.append({"type": "fcstd", "path": str(fcstd_files[0]), "label": "FreeCAD Model"})
            
            net_files = list(run_dir.glob("*.net")) + list(run_dir.glob("*.cir"))
            for net_file in net_files:
                assets.append({"type": "net", "path": str(net_file), "label": f"SPICE Netlist ({net_file.name})"})
            
            csv_files = list(run_dir.glob("*.csv")) + list(run_dir.glob("*_data.txt"))
            for csv_file in csv_files:
                assets.append({"type": "csv", "path": str(csv_file), "label": f"Simulation Data ({csv_file.name})"})
            
            fluid_files = list(run_dir.glob("*.ct")) + list(run_dir.glob("*.json"))
            for fluid_file in fluid_files:
                # Use 'net' type icon for fluidsim files as well for now
                assets.append({"type": "net", "path": str(fluid_file), "label": f"FluidSim Model ({fluid_file.name})"})
            
            # Also check for STEP files for 3D viewer
            step_files = list(run_dir.glob("*.step")) + list(run_dir.glob("*.stl"))
            for step_file in step_files:
                assets.append({"type": "step", "path": str(step_file), "label": f"3D Model ({step_file.name})"})
            
            # Collect plot images from figs directory
            figs_dir = run_dir / "figs"
            if figs_dir.exists():
                plot_files = list(figs_dir.glob("*.png")) + list(figs_dir.glob("*.jpg")) + list(figs_dir.glob("*.jpeg")) + list(figs_dir.glob("*.svg"))
                for plot_file in plot_files:
                    assets.append({"type": "image", "path": str(plot_file), "label": f"Plot: {plot_file.stem}"})
            
            # Also check for schematic images
            schematic_files = list(run_dir.glob("*schematic*.png")) + list(run_dir.glob("*circuit*.png"))
            for sch_file in schematic_files:
                assets.append({"type": "image", "path": str(sch_file), "label": f"Schematic: {sch_file.stem}"})
        
        # Extract latex and markdown text if available
        markdown_text = ""
        latex_text = ""
        if run_dir.exists():
            tex_files = list(run_dir.glob("*.tex"))
            if tex_files:
                try:
                    with open(tex_files[0], "r", encoding="utf-8") as f:
                        latex_text = f.read()
                    import re
                    body = latex_text
                    if r"\begin{document}" in body:
                        body = body.split(r"\begin{document}")[1].split(r"\end{document}")[0]
                    body = re.sub(r"\\section\*?\{([^}]+)\}", r"## \1\n", body)
                    body = re.sub(r"\\subsection\*?\{([^}]+)\}", r"### \1\n", body)
                    body = re.sub(r"\\textbf\{([^}]+)\}", r"**\1**", body)
                    body = re.sub(r"\\textit\{([^}]+)\}", r"*\1*", body)
                    body = re.sub(r"\\item", r"- ", body)
                    body = re.sub(r"\\begin\{itemize\}|\end\{itemize\}", "", body)
                    body = re.sub(r"\\begin\{enumerate\}|\end\{enumerate\}", "", body)
                    body = re.sub(r"\\begin\{figure\}.*?\end\{figure\}", "[Simulation Plot / Schematic]", body, flags=re.DOTALL)
                    markdown_text = f"# {exp_name}\n\n" + body.strip()
                except Exception as e:
                    pass

        if markdown_text or latex_text:
            await websocket.send_text(json.dumps({
                "type": "report_ready",
                "reportId": report_id,
                "markdown": markdown_text,
                "latex": latex_text
            }))

        if assets:
            await websocket.send_text(json.dumps({
                "type": "assets_ready",
                "reportId": report_id,
                "assets": assets
            }))
        
        await websocket.send_text(json.dumps({
            "type": "complete",
            "reportId": report_id,
            "progress": 100,
            "status": "complete",
            "message": "Generation complete"
        }))
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "reportId": report_id,
            "message": str(e)
        }))


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

@app.post("/api/chat", dependencies=[api_key_dep])
async def chat_assistant(request: ChatRequest):
    """Interactive EEE LabGen Chatbot Assistant"""
    user_msg = request.messages[-1].content if request.messages else ""
    system_prompt = (
        "You are LabGen AI Co-Pilot — a world-class Electrical & Electronic Engineering professor, "
        "circuit designer, and simulation expert with deep knowledge of power electronics, analog/digital circuits, "
        "control systems, and embedded systems.\n\n"
        "Your job is to THINK DEEPLY and help users design complete laboratory experiments from scratch. "
        "You reason step-by-step through circuit topology choices, component selection, governing equations, "
        "expected simulation behaviour, and potential failure modes BEFORE giving recommendations.\n\n"
        "When the user describes an experiment or circuit:\n"
        "1. THINK THROUGH the physics and topology — explain why certain component values and architectures are chosen.\n"
        "2. Derive or state the key governing equations (duty cycle, ripple, transfer function, trigger voltage, etc.).\n"
        "3. Give concrete recommended simulation values: Vin, L, C, R, frequency, device part numbers.\n"
        "4. Identify any non-ideal effects or gotchas the student should watch for.\n"
        "5. End EVERY response with a structured LabGen System Proposal in a ```json:proposal``` block:\n\n"
        "```json:proposal\n"
        "{\n"
        '  "experimentName": "Full descriptive experiment title",\n'
        '  "experimentNumber": 2,\n'
        '  "circuitPrompt": "Detailed ngspice-ready circuit description with component values",\n'
        '  "cadPrompt": "3D enclosure / heatsink / mechanical fixture description"\n'
        "}\n"
        "```\n\n"
        "Be technically rigorous, use LaTeX math ($...$), and keep explanations clear for a 3rd-year EEE student."
    )

    try:
        from pipeline.llm import call_llm
        # Send full conversation history (last 8 messages for context)
        history = "\n".join([f"{m.role.upper()}: {m.content}" for m in request.messages[-8:]])
        reply = call_llm(system_prompt, history, response_json=False)
        return {"reply": reply}
    except Exception as e:
        is_buck_boost = any(k in user_msg.lower() for k in ["buck", "boost", "converter", "inverting"])
        is_fluidsim = any(k in user_msg.lower() for k in ["fluid", "pneumatic", "hydraulic", "cylinder", "valve"])
        if is_buck_boost:
            reply = """### Analysis: Inverting Buck-Boost Converter
            
In continuous conduction mode (CCM), the output voltage is governed by:
$$V_{out} = -V_{in} \\frac{D}{1-D}$$

**Recommended Parameters:**
- **$V_{in}$**: 12V DC
- **Switching Frequency ($f_s$)**: 50 kHz
- **Inductor ($L_1$)**: $100\\mu H$ (CCM boundary limit)
- **Capacitor ($C_1$)**: $470\\mu F$ low-ESR electrolytic
- **Load Resistor ($R_L$)**: $10\\Omega$ (Nominal CCM load)
- **Duty Cycle ($D$)**: 0.5 (Unity mode $\\rightarrow V_{out} \\approx -12V$)

Ready to synthesize the complete lab report, SPICE simulation waveforms, and 3D CAD mechanical model. Click **Confirm & Build System** below to generate!

```json:proposal
{
  "experimentName": "Study and Simulation of Inverting Buck-Boost Converter",
  "experimentNumber": 2,
  "circuitPrompt": "Inverting buck-boost converter with Vin=12V, L=100uH, C=470uF, Rload=10ohm, PWM frequency 50kHz. Inverting diode topology with negative output rail.",
  "cadPrompt": "Industrial DIN-rail converter enclosure with passive aluminum cooling fins and PCB standoffs"
}
```
"""
        elif is_fluidsim:
            reply = f"""### Analysis: FluidSim Pneumatic/Hydraulic Circuit
            
I have reviewed your request for a FluidSim simulation.

```json:proposal
{{
  "experimentName": "Pneumatic Control Simulation",
  "experimentNumber": 3,
  "circuitPrompt": "N/A",
  "fluidsimPrompt": "{user_msg[:200]}",
  "cadPrompt": "Pneumatic valve manifold and cylinder mounting bracket"
}}
```
"""
        else:
            reply = f"""### LabGen Circuit Assistant

I have reviewed your inquiry: "{user_msg[:80]}..."

I can configure and automate:
1. **Dynamic SPICE netlist & multi-condition simulation**
2. **Schematic drawing generation**
3. **Parametric 3D CAD modeling (STEP & STL)**
4. **FluidSim Pneumatic/Hydraulic models**
5. **Publication-grade LaTeX/PDF lab report synthesis**

```json:proposal
{{
  "experimentName": "Laboratory Experiment",
  "experimentNumber": 4,
  "circuitPrompt": "{user_msg[:200]}",
  "cadPrompt": "Electronics enclosure with ventilation slots and mounting tabs",
  "fluidsimPrompt": ""
}}
```
"""
        return {"reply": reply}

@app.post("/api/verify", dependencies=[api_key_dep])
async def verify_report(request: VerifyRequest):
    """Verify an existing report"""
    try:
        import subprocess
        labgen_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Output to a temporary file
        out_path = f"/tmp/verify_{uuid.uuid4().hex}.json"
        
        cmd = ["python", "main.py", "verify", request.reportPath, "--experiment", request.experimentName]
        if request.dataPath:
            cmd.extend(["--data", request.dataPath])
        cmd.extend(["--output", out_path])
        
        process = subprocess.run(cmd, cwd=labgen_dir, capture_output=True, text=True)
        
        if os.path.exists(out_path):
            with open(out_path, "r") as f:
                results = json.load(f)
            os.remove(out_path)
            return {
                "status": "verified",
                "summary": results.get("summary", {"passed": True, "failures": 0, "warnings": 0}),
                "details": results
            }
            
        return {
            "status": "error",
            "message": "Verification failed to produce output",
            "log": process.stderr or process.stdout
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reports/{report_id}/pdf", dependencies=[api_key_dep])
async def get_report_pdf(report_id: str):
    """Serve the generated PDF"""
    runs_dir = Path(__file__).parent.parent / "runs"
    target_dir = report_run_dirs.get(report_id)
    if target_dir and target_dir.exists():
        pdf_files = list(target_dir.glob("*.pdf"))
        if pdf_files:
            return FileResponse(pdf_files[0], media_type="application/pdf")
            
    for run_dir in runs_dir.iterdir():
        if run_dir.is_dir() and (run_dir.name == report_id or report_id in run_dir.name):
            pdf_files = list(run_dir.glob("*.pdf"))
            if pdf_files:
                return FileResponse(pdf_files[0], media_type="application/pdf")
    raise HTTPException(status_code=404, detail="Report not found")

@app.get("/api/reports/{report_id}/asset/{asset_path:path}", dependencies=[api_key_dep])
async def get_report_asset(report_id: str, asset_path: str):
    """Serve any generated asset (STL, STEP, FCStd, netlist, CSV, images)"""
    runs_dir = Path(__file__).parent.parent / "runs"
    p = Path(asset_path)
    if p.exists() and p.is_file() and str(runs_dir) in str(p.resolve()):
        asset_file = p
    else:
        target_dir = report_run_dirs.get(report_id)
        if target_dir and (target_dir / asset_path).exists():
            asset_file = target_dir / asset_path
        else:
            asset_file = None
            for r_dir in runs_dir.iterdir():
                if r_dir.is_dir():
                    candidate = r_dir / asset_path
                    if candidate.exists() and candidate.is_file():
                        asset_file = candidate
                        break
                    basename_candidate = r_dir / Path(asset_path).name
                    if basename_candidate.exists() and basename_candidate.is_file():
                        asset_file = basename_candidate
                        break

    if asset_file and asset_file.exists() and asset_file.is_file():
        media_type = "application/octet-stream"
        if asset_file.suffix == ".pdf":
            media_type = "application/pdf"
        elif asset_file.suffix in [".csv", ".txt", ".json", ".ct"]:
            media_type = "text/plain"
        elif asset_file.suffix in [".net", ".cir", ".tex"]:
            media_type = "text/plain"
        elif asset_file.suffix in [".png", ".jpg", ".jpeg"]:
            media_type = "image/png"
        elif asset_file.suffix == ".svg":
            media_type = "image/svg+xml"
        elif asset_file.suffix in [".step", ".stp", ".stl", ".FCStd"]:
            media_type = "application/octet-stream"
        return FileResponse(asset_file, media_type=media_type, filename=asset_file.name)

    raise HTTPException(status_code=404, detail="Asset not found")

@app.get("/api/settings", dependencies=[api_key_dep])
async def get_settings():
    return settings

@app.post("/api/settings", dependencies=[api_key_dep])
async def update_settings(new_settings: dict):
    global settings
    settings.update(new_settings)
    save_settings(settings)
    return {"status": "updated"}

# Serve frontend in production
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)