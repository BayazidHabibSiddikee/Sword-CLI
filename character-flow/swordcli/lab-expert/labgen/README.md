# LabGen: EEE Laboratory Report Generator & Verifier

LabGen is an automated pipeline for generating **and verifying** Electrical and Electronic Engineering (EEE) laboratory reports in PDF format. It uses LLMs for intelligent drafting, ngspice for circuit simulation, LaTeX for high-quality PDF rendering, **OCR for scanned documents**, **FreeCAD for 3D design validation**, and a **LightGBM classifier** for automated quality checking.

## Features

- **Dynamic Circuit Generation:** Provide a natural language prompt, and the LLM designs the circuit, generates a netlist for `ngspice`, and draws the schematic using `schemdraw`.
- **RAG-Powered Research:** Hybrid retrieval combining local knowledge base (BM25 + MiniLM embeddings with RRF fusion) and web search for factual data (datasheets, theories).
- **OCR Support:** Automatic detection and extraction of text from scanned PDFs using Tesseract (pdf2image) with PaddleOCR fallback.
- **FreeCAD Integration:** Headless script execution via `freecadcmd` for 3D design validation, script checking, and synthetic training data generation.
- **Verification Pipeline:** 6 validators (text, data, structure, circuit, references, semantics) + LightGBM classifier for automated quality scoring.
- **LangGraph Architecture:** Uses LangGraph for stateful, section-by-section drafting and verification.
- **Strict Formatting:** Adheres to RUET standard (Times New Roman 12pt, bold headings, full-bordered tables).

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt

# System dependencies
# Ubuntu/Debian: apt-get install tesseract-ocr poppler-utils freecad
# Arch: pacman -S tesseract poppler freecad
```

### 2. Configure Settings
Edit `settings.json` with your API key and preferences:
```json
{
  "llm": {
    "provider": "custom",
    "base_url": "https://generativelanguage.googleapis.com/v1beta",
    "api_key": "YOUR_GEMINI_API_KEY",
    "model": "gemini-2.5-pro",
    "temperature": 0.2
  },
  "verification": {
    "enabled": true,
    "classifier_path": "models/verifier_classifier.txt",
    "feature_names_path": "models/feature_names.json",
    "threshold": 0.5
  },
  "rag": {
    "enabled": true,
    "use_web": true,
    "top_k": 5,
    "ocr_enabled": true,
    "ocr_lang": "eng",
    "ocr_dpi": 200
  },
  "freecad": {
    "enabled": true,
    "cmd": "freecadcmd",
    "timeout": 120,
    "training_data_dir": "freecad_training_data"
  }
}
```

### 3. Run Commands

#### Generate a Report
```bash
# Basic run
python main.py generate "TRIAC Characteristics"

# With circuit prompt
python main.py generate "TRIAC Characteristics" "TRIAC with 1k gate resistor" --exp 2
```

#### Verify a Report (auto-runs after generation)
```bash
# Verify existing run directory
python main.py verify runs/triac_characteristics --experiment "TRIAC Characteristics"

# Verify external PDF with simulation data
python main.py verify report.pdf --experiment "TRIAC Characteristics" --data iv_data.txt

# Verify external PDF without simulation data
python main.py verify report.pdf --experiment "TRIAC Characteristics"
```

#### Manage RAG Index
```bash
# Build/rebuild index from rag_data/
python main.py index --rebuild

# Query the knowledge base
python main.py index --query "TRIAC gate trigger voltage" --top-k 5
```

#### Train LightGBM Classifier (on Kaggle or local)
```bash
# Local training with collected PDFs
python train_classifier.py --input-dir Documents --output-dir models/

# On Kaggle (200+ PDFs)
python train_classifier.py --input-dir /kaggle/input/pdfs --labels-file labels.csv --output-dir models/
# Download models/verifier_classifier.txt and models/feature_names.json to labgen/models/
```

#### Generate FreeCAD Training Data
```bash
# Generate synthetic FreeCAD dataset for fine-tuning
python -c "from labgen.pipeline.freecad import generate_training_dataset; generate_training_dataset('freecad_training_data', 100)"
```

## Ecosystem & Folder Structure

```
LAB_Expert/
├── labgen/                      # This repo
│   ├── pipeline/
│   │   ├── validators/          # 6 validators: text, data, structure, circuit, references, semantics
│   │   ├── rag.py               # BM25 + MiniLM + RRF fusion
│   │   ├── ocr.py               # OCR with tesseract/paddleocr
│   │   ├── freecad.py           # FreeCAD headless execution & training data
│   │   ├── ingest.py            # PDF extraction (OCR-aware)
│   │   └── ...
│   ├── models/                  # LightGBM classifier + feature names
│   ├── rag_data/                # 73+ converted lab reports (Markdown)
│   ├── rag_index/               # FAISS + BM25 index files
│   ├── Documents/               # Source PDFs for RAG/training
│   ├── store/                   # Raw PDFs for OCR/RAG
│   ├── runs/                    # Generated reports + verification reports
│   ├── main.py                  # CLI entry point
│   ├── train_classifier.py      # LightGBM training script
│   ├── convert_store_docs.py    # PDF/DOCX -> Markdown for RAG
│   └── settings.json            # Configuration
├── web-scraper/                 # Symlinked for image scraping
└── FluidSim-Linux/              # Symlinked for PLC/pneumatic/hydraulic simulation
```

## Verification Pipeline Details

The verification runs **automatically after generation** and produces `verification_report.json`:

| Validator | Checks |
|-----------|--------|
| **text** | Repetition loops (n-gram Jaccard), word counts, past-tense compliance, objectives format ("To ...") |
| **data** | Table vs simulation cross-check (interpolates ngspice IV curve, flags >20% error) |
| **structure** | Required sections, apparatus list, references, figures |
| **circuit** | Netlist-apparatus name overlap, schemdraw syntax validity |
| **references** | URL reachability (HEAD), domain overlap with research context |
| **semantics** | LLM-as-judge: physics errors, hallucinated values, unsupported claims |

**Classifier**: LightGBM on 22 engineered features → predicts `pass/fail` with probability.

## LightGBM Classifier Training

### Data Requirements
- **200+ PDFs** of lab reports (mixed quality)
- **Optional**: `labels.csv` with `filename,label` (1=fail, 0=pass) for supervised training
- **Without labels**: Uses weak supervision (heuristic from validator outputs)

### Training on Kaggle
```bash
# 1. Upload your PDFs to Kaggle dataset
# 2. Create notebook, copy train_classifier.py
# 3. Run:
python train_classifier.py --input-dir /kaggle/input/pdfs --labels-file /kaggle/input/labels.csv --output-dir /kaggle/working/models/

# 4. Download: verifier_classifier.txt, feature_names.json
# 5. Place in labgen/models/
```

### Weak Supervision Labels (no manual labels needed)
The script auto-generates labels from validator heuristics:
```python
label = 1 (fail) if:
  - repetition_score > 0.3
  - sim_match_rate < 0.8
  - llm_violation_count > 0
  - url_validity_rate < 0.5
```

## FreeCAD Integration

### Validate a Design Script
```python
from labgen.pipeline.freecad import FreeCADExecutor
executor = FreeCADExecutor()

script = '''
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("Test")
box = Part.makeBox(10, 20, 30)
Part.show(box)
doc.recompute()
Mesh.export([doc.Objects[-1]], "/tmp/box.stl")
'''

# Validate syntax & patterns
validation = executor.validate_script(script)

# Execute headlessly
result = executor.execute_script(script, output_dir="/tmp/freecad_out")
print(result.success, result.output_files)
```

### Generate Training Data for Fine-tuning
```bash
# Creates freecad_training_data/dataset.jsonl with (NL description, FreeCAD script) pairs
python -c "from labgen.pipeline.freecad import generate_training_dataset; generate_training_dataset('freecad_training_data', 200)"
```

### FreeCAD Agent (Iterative Design)
```python
from labgen.pipeline.freecad import FreeCADAgent, DesignSpec

agent = FreeCADAgent(FreeCADExecutor())
spec = DesignSpec(
    description="A 50x30x20mm box with 8mm center hole",
    parameters={"length": 50, "width": 30, "height": 20, "hole_radius": 8},
    constraints=["hole centered", "STEP export"]
)

# Requires llm_call_fn(system_prompt, user_prompt) -> script
result, final_script = agent.design_from_spec(spec, your_llm_function)
```

## OCR Usage

OCR runs automatically during PDF ingestion for verification and RAG:
```python
from labgen.pipeline.ocr import extract_text_with_ocr
result = extract_text_with_ocr("scanned_report.pdf")
# Returns: {"method": "ocr|pymupdf", "text": "...", "scanned": bool, "pages": [...]}
```

## RAG Knowledge Base

```bash
# Convert Documents/ to Markdown for RAG (73 files already done)
python convert_store_docs.py --input-dir Documents --output-dir rag_data

# Index gets built automatically on first query, or force rebuild:
python main.py index --rebuild

# Query:
python main.py index --query "SCR gate trigger voltage"
```

## Requirements
```
google-genai
langchain
langgraph
langchain-google-genai
schemdraw
pandas
matplotlib
pdfplumber
PyMuPDF
lightgbm
scikit-learn
sentence-transformers
faiss-cpu
spacy
requests
pdf2image
pytesseract
pillow
rank_bm25
```

## Project Structure
- `main.py` — CLI: generate, verify, index
- `pipeline/rag.py` — BM25 + MiniLM + RRF
- `pipeline/ocr.py` — OCR (tesseract + pdf2image + paddleocr)
- `pipeline/freecad.py` — FreeCAD executor, validator, data generator, agent
- `pipeline/ingest.py` — OCR-aware PDF extraction
- `pipeline/verify.py` — 6 validators + LightGBM classifier
- `pipeline/validators/` — text, data, structure, circuit, references, semantics
- `train_classifier.py` — LightGBM training (Kaggle/local)
- `convert_store_docs.py` — PDF/DOCX → Markdown (uses web-scraper's markitdown)
- `generate_synthetic_training.py` — Synthetic data for classifier
## Phase 10: Cyberdeck UI & Architecture Overhaul (Web IDE)
- Sandboxed `exec()` in `main.py` and restricted CORS in `server.py`
- Added global React ErrorBoundary, debounced `localStorage` writes.
- Responsive Drawer pattern for mobile and removed 'AI-slop' visual aesthetics.
- Virtualized terminal output using `requestAnimationFrame` for high performance rendering.

## Phase 11: 3-Pane IDE Polish & Intervention Backend
- Live Markdown/LaTeX preview using `react-markdown`, `remark-math`, and `rehype-katex`.
- Fully featured Three.js 3D CAD viewer for STL files with graceful fallback for WASM-required formats (STEP/FCStd).
- Advanced Intervention Backend connecting `intervention_response` to pause/resume generation via OS signals (SIGSTOP/SIGCONT) and `asyncio.Event`.
- Playwright End-to-End (E2E) UI test coverage.
