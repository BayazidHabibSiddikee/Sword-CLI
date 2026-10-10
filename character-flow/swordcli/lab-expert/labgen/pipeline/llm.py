import os
import json
import requests
from typing import Dict, Any
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type, before_sleep_log
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from pipeline.config import load_settings, get_api_key

def get_llm_config() -> Dict[str, Any]:
    return load_settings().get("llm", {})

@retry(
    wait=wait_exponential(multiplier=1.5, min=2, max=6),
    stop=stop_after_attempt(2),
    retry=retry_if_exception_type((requests.exceptions.HTTPError, ValueError)),
    reraise=True,
    before_sleep=lambda retry_state: logger.warning(f"API Rate Limit hit, retrying in {retry_state.next_action.sleep}s... (attempt {retry_state.attempt_number})")
)
def call_llm(system_prompt: str, user_prompt: str, response_json: bool = True) -> Dict[str, Any]:
    config = get_llm_config()
    provider = config.get("provider", "custom")
    base_url = config.get("base_url", "")
    api_key = config.get("api_key", "")
    model = config.get("model", "gemini-2.5-pro")
    temperature = config.get("temperature", 0.2)
    
    if not api_key or api_key == "YOUR_API_KEY":
        api_key = get_api_key()
        if not api_key:
            raise ValueError("No API key configured in settings.json or GEMINI_API_KEY env var")
    
    headers = {"Content-Type": "application/json"}
    
    if "openai" in base_url or "localhost" in base_url or "127.0.0.1" in base_url or provider == "openai":
        # OpenAI-compatible API
        headers["Authorization"] = f"Bearer {api_key}"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}
        
        resp = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "choices" in data and len(data["choices"]) > 0:
            text = data["choices"][0].get("message", {}).get("content", "")
        elif "candidates" in data and len(data["candidates"]) > 0:
            text = data["candidates"][0].get("content", {}).get("parts", [{}])[0].get("text", "")
        else:
            raise ValueError(f"Unrecognized LLM response format: {data}")
    
    elif "generativelanguage" in base_url or provider == "gemini":
        # Google Gemini API
        headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {"temperature": temperature, "responseMimeType": "application/json" if response_json else "text/plain"}
        }
        resp = requests.post(f"{base_url}/models/{model}:generateContent", headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    
    else:
        # Default: try OpenAI-compatible
        headers["Authorization"] = f"Bearer {api_key}"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}
        resp = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "choices" in data and len(data["choices"]) > 0:
            text = data["choices"][0].get("message", {}).get("content", "")
        elif "candidates" in data and len(data["candidates"]) > 0:
            text = data["candidates"][0].get("content", {}).get("parts", [{}])[0].get("text", "")
        else:
            raise ValueError(f"Unrecognized LLM response format: {data}")
    
    # Clean up response
    if text is None:
        raise ValueError("LLM returned empty content")
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    
    if response_json:
        return json.loads(text.strip())
    return text

def generate_report_sections(experiment_name: str, research_context: str, circuit_json: Dict[str, Any] = None) -> Dict[str, Any]:
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "system_prompt.txt")
    with open(prompt_path, "r") as f:
        system_prompt = f.read()
    
    user_prompt = f"""
Experiment Name: {experiment_name}

Research Context:
{research_context}

Generate the following sections for the lab report as a JSON object:
{{
    "objectives": ["To ...", "To ..."],
    "theory": "Introduction paragraph 1... \\n\\nIntroduction paragraph 2...",
    "procedure": ["Step 1...", "Step 2...", "Step 3..."],
    "discussion": "Past tense discussion...",
    "conclusion": "Past tense conclusion..."
}}
Ensure you meet the word counts specified in your system instructions.
"""
    if circuit_json:
        user_prompt += f"\n\nCircuit Design Details:\n{json.dumps(circuit_json, indent=2)}\nIncorporate these circuit details into the procedure, theory, and discussion where applicable."

    return call_llm(system_prompt, user_prompt, response_json=True)

def generate_circuit_design(experiment_name: str, connection_prompt: str) -> Dict[str, Any]:
    system_prompt = """You are an expert EEE circuit designer. Output valid JSON only."""
    
    user_prompt = f"""
Experiment: {experiment_name}
Connection Instructions: {connection_prompt if connection_prompt else "Design a standard, typical circuit for this experiment."}

CRITICAL NGSPICE RULES:
1. The voltage source MUST be named V1 and connected to node 1 and 0 (e.g. V1 1 0 DC 0).
2. The circuit MUST use numbers for nodes (0, 1, 2, 3...) not letters.
3. Subcircuits like TRIAC and DIAC MUST start with X (e.g. XT1 3 0 4 TRIAC, XD1 2 3 DIAC).
4. Do NOT use generic names like LAMP or AC_LOAD. Use R for resistors, C for capacitors.
5. Node 2 MUST be the primary voltage node of interest because the simulation sweeps V1 and plots V(2) vs I(V1).
6. DO NOT use variables like {{Rvar}} in the netlist components. Give concrete values (e.g. R1 1 2 10k).

Provide a JSON representation of the circuit:
{{
    "circuit_design_text": "Detailed explanation of how the circuit is designed and works.",
    "apparatus": [
        {{"name": "Resistor (1k Ohm)", "quantity": "1"}},
        {{"name": "TRIAC (BT136)", "quantity": "1"}}
    ],
    "netlist_components": [
        "V1 1 0 DC 0",
        "R1 1 2 1k",
        "XD1 2 3 DIAC",
        "XT1 3 0 4 TRIAC"
    ],
    "schemdraw_code": "def draw_circuit(output_path):\n    import schemdraw\n    import schemdraw.elements as elm\n    with schemdraw.Drawing(file=output_path, show=False) as d:\n        d += elm.SourceV().up().label('Vac')\n        d += elm.Resistor().right().label('1k')\n        # Add other components...\n"
}}
Ensure the schemdraw_code contains a single function named draw_circuit(output_path).
"""
    
    return call_llm(system_prompt, user_prompt, response_json=True)