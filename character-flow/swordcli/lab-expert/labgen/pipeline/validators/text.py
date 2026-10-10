import re
from collections import Counter
from typing import Any, Dict, List

try:
    import spacy
    NLP = spacy.load("en_core_web_sm")
except Exception:
    NLP = None

MIN_WORDS = {"introduction": 220, "discussion": 150, "conclusion": 150}

def _sentences(text: str) -> List[str]:
    return [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]

def _ngrams(tokens: List[str], n: int = 3) -> List[tuple]:
    return [tuple(tokens[i:i+n]) for i in range(len(tokens)-n+1)]

def _repetition_score(text: str) -> float:
    sentences = _sentences(text)
    if len(sentences) < 2:
        return 0.0
    all_ngrams = []
    for s in sentences:
        tokens = s.lower().split()
        all_ngrams.extend(_ngrams(tokens, 3))
    if not all_ngrams:
        return 0.0
    counts = Counter(all_ngrams)
    repeated = sum(c for c in counts.values() if c > 1)
    return repeated / len(all_ngrams)

def _word_count(text: str) -> int:
    return len(text.split())

def _tense_violations(text: str) -> int:
    if NLP is None:
        return 0
    doc = NLP(text)
    violations = 0
    for token in doc:
        if token.pos_ == "VERB" and token.tag_ in ("VBP", "VBZ", "VBG"):
            if token.dep_ not in ("aux", "auxpass"):
                violations += 1
    return violations

def _objectives_compliance(objectives: List[str]) -> float:
    if not objectives:
        return 0.0
    valid = sum(1 for o in objectives if o.strip().lower().startswith("to "))
    return valid / len(objectives)

def check_text(report: Dict[str, Any]) -> List[Dict]:
    issues = []
    sections = report.get("sections", {})

    intro = sections.get("theory", "")
    discussion = sections.get("discussion", "")
    conclusion = sections.get("conclusion", "")
    objectives = sections.get("objectives", [])

    rep_intro = _repetition_score(intro)
    rep_disc = _repetition_score(discussion)
    rep_conc = _repetition_score(conclusion)

    if rep_intro > 0.3:
        issues.append({
            "module": "text",
            "severity": "high",
            "category": "repetition",
            "message": f"Introduction has high repetition (score={rep_intro:.2f}) - likely hallucinated loops",
            "location": {"section": "Introduction"}
        })

    if rep_disc > 0.3:
        issues.append({
            "module": "text",
            "severity": "high",
            "category": "repetition",
            "message": f"Discussion has high repetition (score={rep_disc:.2f})",
            "location": {"section": "Discussion"}
        })

    if rep_conc > 0.3:
        issues.append({
            "module": "text",
            "severity": "high",
            "category": "repetition",
            "message": f"Conclusion has high repetition (score={rep_conc:.2f})",
            "location": {"section": "Conclusion"}
        })

    wc_intro = _word_count(intro)
    wc_disc = _word_count(discussion)
    wc_conc = _word_count(conclusion)

    if wc_intro < MIN_WORDS["introduction"]:
        issues.append({
            "module": "text",
            "severity": "medium",
            "category": "word_count",
            "message": f"Introduction only {wc_intro} words (minimum {MIN_WORDS['introduction']})",
            "location": {"section": "Introduction"}
        })

    if wc_disc < MIN_WORDS["discussion"]:
        issues.append({
            "module": "text",
            "severity": "medium",
            "category": "word_count",
            "message": f"Discussion only {wc_disc} words (minimum {MIN_WORDS['discussion']})",
            "location": {"section": "Discussion"}
        })

    if wc_conc < MIN_WORDS["conclusion"]:
        issues.append({
            "module": "text",
            "severity": "medium",
            "category": "word_count",
            "message": f"Conclusion only {wc_conc} words (minimum {MIN_WORDS['conclusion']})",
            "location": {"section": "Conclusion"}
        })

    if discussion or conclusion:
        tense_disc = _tense_violations(discussion)
        tense_conc = _tense_violations(conclusion)
        if tense_disc > 3:
            issues.append({
                "module": "text",
                "severity": "medium",
                "category": "tense",
                "message": f"Discussion has {tense_disc} present-tense verbs (should be past tense)",
                "location": {"section": "Discussion"}
            })
        if tense_conc > 3:
            issues.append({
                "module": "text",
                "severity": "medium",
                "category": "tense",
                "message": f"Conclusion has {tense_conc} present-tense verbs (should be past tense)",
                "location": {"section": "Conclusion"}
            })

    obj_score = _objectives_compliance(objectives)
    if obj_score < 1.0 and objectives:
        issues.append({
            "module": "text",
            "severity": "medium",
            "category": "objectives_format",
            "message": f"Only {obj_score*100:.0f}% of objectives start with 'To '",
            "location": {"section": "Objectives"}
        })

    return issues

def feature_vector(report: Dict[str, Any]) -> Dict[str, float]:
    sections = report.get("sections", {})
    intro = sections.get("theory", "")
    discussion = sections.get("discussion", "")
    conclusion = sections.get("conclusion", "")
    objectives = sections.get("objectives", [])

    return {
        "repetition_score": max(_repetition_score(intro), _repetition_score(discussion), _repetition_score(conclusion)),
        "intro_words": float(_word_count(intro)),
        "discussion_words": float(_word_count(discussion)),
        "conclusion_words": float(_word_count(conclusion)),
        "tense_violations": float(_tense_violations(discussion) + _tense_violations(conclusion)),
        "objectives_compliance": _objectives_compliance(objectives),
    }