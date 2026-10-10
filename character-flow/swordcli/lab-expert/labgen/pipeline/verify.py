import json
import os
from typing import Any, Dict, List

from pipeline.validators import text, data, structure, circuit, references, semantics

ALL_VALIDATORS = [text, data, structure, circuit, references, semantics]

def run_all_checks(report: Dict[str, Any]) -> Dict[str, Any]:
    print("Running Verification Pipeline...")
    issues = []

    # Each validator module exposes exactly one check_* function.
    # Map module names to their check function for a clean dispatch.
    _DISPATCH = {
        "text":       "check_text",
        "data":       "check_data",
        "structure":  "check_structure",
        "circuit":    "check_circuit",
        "references": "check_references",
        "semantics":  "check_semantics",
    }

    for validator in ALL_VALIDATORS:
        module_name = validator.__name__.split(".")[-1]
        fn_name = _DISPATCH.get(module_name)
        fn = getattr(validator, fn_name, None) if fn_name else None

        # Fallback: find any check_* method if the name isn't in the dispatch table
        if fn is None:
            for candidate in dir(validator):
                if candidate.startswith("check_"):
                    fn = getattr(validator, candidate)
                    break

        if fn is None:
            issues.append({
                "module": module_name,
                "severity": "low",
                "category": "validator_error",
                "message": f"No check_* function found in validator '{module_name}'",
                "location": {}
            })
            continue

        try:
            result = fn(report)
            issues.extend(result)
        except Exception as e:
            issues.append({
                "module": module_name,
                "severity": "low",
                "category": "validator_error",
                "message": f"Validator failed: {e}",
                "location": {}
            })

    failures = [i for i in issues if i.get("severity") == "high"]
    warnings = [i for i in issues if i.get("severity") == "medium"]
    passes = [i for i in issues if i.get("severity") == "low"]

    result = {
        "summary": {
            "passed": len(failures) == 0,
            "failures": len(failures),
            "warnings": len(warnings),
            "info": len(passes)
        },
        "issues": issues
    }
    return result

def extract_features(report: Dict[str, Any]) -> Dict[str, float]:
    features = {}
    for validator in ALL_VALIDATORS:
        try:
            fv = validator.feature_vector(report)
            features.update(fv)
        except Exception:
            pass
    return features

def write_report(results: Dict[str, Any], path: str):
    with open(path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Verification report written to {path}")

def load_classifier(classifier_path: str, feature_names_path: str):
    try:
        import lightgbm as lgb
        model = lgb.Booster(model_file=classifier_path)
        with open(feature_names_path, "r") as f:
            feature_names = json.load(f)
        return model, feature_names
    except Exception as e:
        print(f"Could not load classifier: {e}")
        return None, None

def predict_classifier(model, feature_names: List[str], features: Dict[str, float]) -> Dict[str, Any]:
    if model is None:
        return {"prediction": "unknown", "probability": 0.0}
    import numpy as np
    x = np.array([[features.get(name, 0.0) for name in feature_names]])
    prob = model.predict(x)[0]
    pred = 1 if prob > 0.5 else 0
    return {"prediction": "fail" if pred == 1 else "pass", "probability": float(prob)}