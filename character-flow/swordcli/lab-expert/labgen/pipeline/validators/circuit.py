import ast
import re
from typing import Any, Dict, List

def _extract_netlist_names(netlist_components: List[str]) -> List[str]:
    names = []
    for line in netlist_components:
        parts = line.strip().split()
        if parts and parts[0][0].isalpha():
            names.append(parts[0])
    return names

def _extract_apparatus_names(apparatus: List[Dict]) -> List[str]:
    names = []
    for item in apparatus:
        name = item.get("name", "").lower()
        name = re.sub(r"[\(\)\$\{\}\\\\]", "", name)
        name = re.sub(r"\s+", " ", name).strip()
        names.append(name)
    return names

def _name_overlap(netlist_names: List[str], apparatus_names: List[str]) -> float:
    if not netlist_names or not apparatus_names:
        return 0.0
    net_set = set(n.lower() for n in netlist_names)
    app_set = set(n.lower() for n in apparatus_names)
    overlap = net_set & app_set
    return len(overlap) / max(len(net_set), len(app_set))

def _schemdraw_valid(code: str) -> bool:
    if not code:
        return False
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "draw_circuit":
                return True
        return False
    except SyntaxError:
        return False

def check_circuit(report: Dict[str, Any]) -> List[Dict]:
    issues = []
    circuit_json = report.get("circuit_json", {})
    sections = report.get("sections", {})

    netlist = circuit_json.get("netlist_components", [])
    apparatus = sections.get("apparatus", [])

    if netlist and apparatus:
        overlap = _name_overlap(_extract_netlist_names(netlist), _extract_apparatus_names(apparatus))
        if overlap < 0.3:
            issues.append({
                "module": "circuit",
                "severity": "medium",
                "category": "netlist_apparatus_mismatch",
                "message": f"Low overlap between netlist components and apparatus list (overlap={overlap:.0%})",
                "location": {"section": "Circuit Design / Required Apparatus"}
            })

    schemdraw_code = circuit_json.get("schemdraw_code", "")
    if schemdraw_code and not _schemdraw_valid(schemdraw_code):
        issues.append({
            "module": "circuit",
            "severity": "medium",
            "category": "schemdraw_syntax_error",
            "message": "schemdraw_code has syntax errors or missing draw_circuit function",
            "location": {"section": "Circuit Design"}
        })

    return issues

def feature_vector(report: Dict[str, Any]) -> Dict[str, float]:
    circuit_json = report.get("circuit_json", {})
    sections = report.get("sections", {})

    netlist = circuit_json.get("netlist_components", [])
    apparatus = sections.get("apparatus", [])
    schemdraw_code = circuit_json.get("schemdraw_code", "")

    overlap = _name_overlap(_extract_netlist_names(netlist), _extract_apparatus_names(apparatus)) if netlist and apparatus else 0.0
    schemdraw_ok = float(_schemdraw_valid(schemdraw_code))

    return {
        "netlist_apparatus_overlap": overlap,
        "schemdraw_valid": schemdraw_ok,
    }