import re
from typing import Any, Dict, List

REQUIRED_SECTIONS = [
    "objectives", "theory", "circuit_design", "apparatus",
    "procedure", "data_table_latex", "discussion", "conclusion", "references"
]

def check_structure(report: Dict[str, Any]) -> List[Dict]:
    issues = []
    sections = report.get("sections", {})

    missing = [s for s in REQUIRED_SECTIONS if not sections.get(s)]
    if missing:
        issues.append({
            "module": "structure",
            "severity": "high",
            "category": "missing_sections",
            "message": f"Missing required sections: {', '.join(missing)}",
            "location": {"sections": missing}
        })

    apparatus = sections.get("apparatus", [])
    if not apparatus:
        issues.append({
            "module": "structure",
            "severity": "medium",
            "category": "empty_apparatus",
            "message": "Apparatus list is empty",
            "location": {"section": "Required Apparatus"}
        })

    references = sections.get("references", [])
    if not references:
        issues.append({
            "module": "structure",
            "severity": "medium",
            "category": "no_references",
            "message": "No references listed",
            "location": {"section": "References"}
        })

    fig_count = len(report.get("plots", []))
    if fig_count == 0:
        issues.append({
            "module": "structure",
            "severity": "medium",
            "category": "no_figures",
            "message": "No figures/plots in report",
            "location": {}
        })

    if sections.get("circuit_img"):
        fig_count += 1
    if sections.get("theory_img"):
        fig_count += 1

    return issues

def feature_vector(report: Dict[str, Any]) -> Dict[str, float]:
    sections = report.get("sections", {})
    bitmap = 0
    for i, s in enumerate(REQUIRED_SECTIONS):
        if sections.get(s):
            bitmap |= (1 << i)

    return {
        "section_bitmap": float(bitmap),
        "figure_count": float(len(report.get("plots", [])) + (1 if sections.get("circuit_img") else 0) + (1 if sections.get("theory_img") else 0)),
        "apparatus_count": float(len(sections.get("apparatus", []))),
        "ref_count": float(len(sections.get("references", []))),
    }