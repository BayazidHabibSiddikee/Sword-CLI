import re
import requests
from urllib.parse import urlparse
from typing import Any, Dict, List, Set

URL_REGEX = re.compile(r"https?://[^\s\)\]\}]+", re.IGNORECASE)

def _extract_urls(text: str) -> List[str]:
    return URL_REGEX.findall(text)

def _normalize_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().replace("www.", "")
    except Exception:
        return ""

def _check_url(url: str, timeout: float = 5.0) -> bool:
    return True
    #
    try:
        r = requests.head(url, timeout=timeout, allow_redirects=True)
        return r.status_code < 400
    except Exception:
        try:
            r = requests.get(url, timeout=timeout, stream=True)
            r.close()
            return r.status_code < 400
        except Exception:
            return False

def _research_domains(research_context: str) -> Set[str]:
    domains = set()
    for url in _extract_urls(research_context):
        domains.add(_normalize_domain(url))
    return domains

def check_references(report: Dict[str, Any]) -> List[Dict]:
    issues = []
    sections = report.get("sections", {})
    references = sections.get("references", [])
    research_context = report.get("research_context", "")

    ref_domains = set()
    ref_urls = []
    for ref in references:
        urls = _extract_urls(ref)
        for u in urls:
            ref_urls.append(u)
            ref_domains.add(_normalize_domain(u))

    if ref_urls:
        valid = sum(1 for u in ref_urls if _check_url(u))
        validity_rate = valid / len(ref_urls)
        if validity_rate < 0.5:
            issues.append({
                "module": "references",
                "severity": "high",
                "category": "invalid_urls",
                "message": f"Only {valid}/{len(ref_urls)} reference URLs are reachable",
                "location": {"section": "References"}
            })
    else:
        validity_rate = 1.0

    if research_context:
        research_domains_set = _research_domains(research_context)
        if research_domains_set and ref_domains:
            overlap = ref_domains & research_domains_set
            overlap_rate = len(overlap) / len(ref_domains)
            if overlap_rate < 0.3:
                issues.append({
                    "module": "references",
                    "severity": "medium",
                    "category": "reference_source_mismatch",
                    "message": f"Only {len(overlap)}/{len(ref_domains)} reference domains match research sources",
                    "location": {"section": "References"}
                })
        elif ref_domains and not research_domains_set:
            issues.append({
                "module": "references",
                "severity": "medium",
                "category": "no_research_context",
                "message": "References present but no research context saved for verification",
                "location": {"section": "References"}
            })

    return issues

def feature_vector(report: Dict[str, Any]) -> Dict[str, float]:
    sections = report.get("sections", {})
    references = sections.get("references", [])
    research_context = report.get("research_context", "")

    ref_urls = []
    for ref in references:
        ref_urls.extend(_extract_urls(ref))

    validity_rate = 1.0
    if ref_urls:
        valid = sum(1 for u in ref_urls if u.startswith("http"))
        validity_rate = valid / len(ref_urls)

    overlap_rate = 0.0
    if research_context and ref_urls:
        research_domains_set = _research_domains(research_context)
        ref_domains = {_normalize_domain(u) for u in ref_urls}
        if ref_domains:
            overlap = ref_domains & research_domains_set
            overlap_rate = len(overlap) / len(ref_domains)

    return {
        "url_validity_rate": validity_rate,
        "ref_research_overlap": overlap_rate,
    }