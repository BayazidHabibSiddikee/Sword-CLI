import json
import os
from typing import Any, Dict, List

def _build_semantics_prompt(report: Dict[str, Any]) -> str:
    sections = report.get("sections", {})
    research = report.get("research_context", "")
    iv_path = report.get("iv_data_path", "")

    sim_summary = ""
    if iv_path and os.path.exists(iv_path):
        try:
            import pandas as pd
            df = pd.read_csv(iv_path, sep=r"\s+", header=None)
            if df.shape[1] >= 2:
                v_min, v_max = df[0].min(), df[0].max()
                if df.shape[1] >= 4:
                    i_min, i_max = df[1].min(), df[1].max()
                else:
                    i_min, i_max = df[1].min(), df[1].max()
                sim_summary = f"Simulation voltage range: {v_min:.1f}V to {v_max:.1f}V. Current range: {i_min*1000:.1f}mA to {i_max*1000:.1f}mA."
        except Exception:
            sim_summary = "Simulation data available but could not be parsed."

    prompt = f"""
You are an expert EEE lab report verifier. Check the Discussion and Conclusion sections for factual errors, hallucinated values, and physics inconsistencies.

EXPERIMENT: {report.get('experiment_name', 'Unknown')}

RESEARCH CONTEXT (ground truth sources):
{research[:3000] if research else 'None provided.'}

SIMULATION DATA SUMMARY:
{sim_summary}

DISCUSSION:
{sections.get('discussion', '')[:2000]}

CONCLUSION:
{sections.get('conclusion', '')[:2000]}

TASK: Identify ALL statements in Discussion/Conclusion that:
1. Cite specific numeric values (voltage, current, resistance, power, frequency, etc.) NOT supported by the simulation data summary above
2. Describe qualitative behavior (e.g., "device turns on at 0.7V", "current saturates at 10mA") that CONTRADICTS the simulation data summary
3. Make claims about device parameters (breakover voltage, holding current, leakage current, etc.) UNSUPPORTED by the research context
4. State incorrect physics (e.g., "TRIAC conducts in reverse bias without gate", "capacitor blocks DC current" in wrong context)

Return STRICT JSON:
{{
  "violations": [
    {{
      "type": "data_mismatch | physics_error | unsupported_claim | hallucinated_value",
      "severity": "high | medium | low",
      "claim": "exact statement from text",
      "expected": "what the data/research actually says",
      "section": "Discussion | Conclusion"
    }}
  ]
}}

If no violations, return {{"violations": []}}.
"""
    return prompt

def _call_llm(prompt: str, settings: Dict) -> Dict:
    from pipeline.llm import call_llm
    try:
        return call_llm("You are a precise EEE lab report verifier. Output only valid JSON.", prompt, response_json=True)
    except Exception as e:
        return {"violations": [], "error": str(e)}

def check_semantics(report: Dict[str, Any]) -> List[Dict]:
    issues = []
    settings = report.get("settings", {})

    result = _call_llm(_build_semantics_prompt(report), settings)

    if "error" in result:
        issues.append({
            "module": "semantics",
            "severity": "low",
            "category": "llm_error",
            "message": f"LLM check failed: {result['error']}",
            "location": {}
        })
        return issues

    for v in result.get("violations", []):
        issues.append({
            "module": "semantics",
            "severity": v.get("severity", "medium"),
            "category": v.get("type", "unknown"),
            "message": f"[{v.get('section', '?')}] {v.get('claim', '')} — Expected: {v.get('expected', '')}",
            "location": {"section": v.get("section", "Unknown")}
        })

    return issues

def feature_vector(report: Dict[str, Any]) -> Dict[str, float]:
    settings = report.get("settings", {})
    result = _call_llm(_build_semantics_prompt(report), settings)

    violations = result.get("violations", [])
    high = sum(1 for v in violations if v.get("severity") == "high")
    medium = sum(1 for v in violations if v.get("severity") == "medium")
    physics = sum(1 for v in violations if v.get("type") == "physics_error")

    return {
        "llm_violation_count": float(len(violations)),
        "llm_high_sev_count": float(high),
        "llm_medium_sev_count": float(medium),
        "llm_physics_error_flag": float(physics > 0),
    }