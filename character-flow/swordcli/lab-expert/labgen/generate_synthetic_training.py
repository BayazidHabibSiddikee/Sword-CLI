#!/usr/bin/env python3
"""
Generate synthetic training data by corrupting existing clean reports.
Creates labeled examples (clean=0, corrupted=1) for LightGBM training.
"""

import json
import os
import random
import re
from pathlib import Path
from typing import Dict, List, Any

RAG_DIR = "/home/sword/Documents/LAB_Expert/labgen/rag_data"
OUTPUT_DIR = "/home/sword/Documents/LAB_Expert/labgen/synthetic_training"
IV_DATA_PATH = "/home/sword/Documents/LAB_Expert/labgen/runs/analyzing_triac_characteristics/iv_data.txt"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_clean_reports(rag_dir: str) -> List[Dict]:
    reports = []
    for md_file in Path(rag_dir).glob("*.md"):
        with open(md_file, "r") as f:
            content = f.read()
        reports.append({"source": md_file.name, "content": content})
    return reports

def parse_sections(content: str) -> Dict[str, str]:
    sections = {}
    current = "unknown"
    buffer = []
    section_pattern = re.compile(r"^(?:#+\s*)?([A-Za-z][A-Za-z ]+):?$", re.MULTILINE)
    
    lines = content.splitlines()
    for line in lines:
        m = section_pattern.match(line.strip())
        if m and len(m.group(1)) < 50:
            if buffer:
                sections[current] = "\n".join(buffer).strip()
            current = m.group(1).lower().replace(" ", "_")
            buffer = []
        else:
            buffer.append(line)
    if buffer:
        sections[current] = "\n".join(buffer).strip()
    return sections

def inject_repetition(text: str, factor: float = 3.0) -> str:
    """Repeat sentences/paragraphs to simulate hallucination loops."""
    sentences = re.split(r'([.!?]+)', text)
    if len(sentences) < 4:
        return text
    result = []
    for i in range(0, len(sentences), 2):
        s = sentences[i] + (sentences[i+1] if i+1 < len(sentences) else "")
        if s.strip():
            result.append(s.strip())
            if random.random() < 0.3:
                for _ in range(int(factor)):
                    result.append(s.strip())
    return " ".join(result)

def inject_data_mismatch(table_text: str, iv_path: str) -> str:
    """Corrupt data table values."""
    try:
        import pandas as pd
        df = pd.read_csv(iv_path, sep=r"\s+", header=None)
        v_vals = pd.concat([df[0], df[2]]).values if df.shape[1] >= 4 else df[0].values
        i_vals = pd.concat([df[1], df[3]]).values if df.shape[1] >= 4 else df[1].values
        
        lines = table_text.splitlines()
        for i, line in enumerate(lines):
            if "&" in line and not line.strip().startswith("\\"):
                parts = line.split("&")
                if len(parts) >= 2:
                    try:
                        v = float(re.sub(r"[^\d\.\-]", "", parts[0]))
                        idx = min(int(abs(v) * 10), len(i_vals) - 1)
                        real_i = i_vals[idx] * 1000
                        fake_i = real_i * random.uniform(5, 50) * random.choice([-1, 1])
                        parts[1] = f" {fake_i:.1f} "
                        lines[i] = " & ".join(parts)
                    except:
                        pass
        return "\n".join(lines)
    except:
        return table_text

def remove_sections(sections: Dict[str, str], remove_prob: float = 0.4) -> Dict[str, str]:
    """Randomly remove sections."""
    result = {}
    for k, v in sections.items():
        if random.random() > remove_prob:
            result[k] = v
    return result

def corrupt_references(refs: str) -> str:
    """Add fake URLs and invalid references."""
    fake_refs = [
        "1. Fake Author (2024). Non-existent Paper. https://fake-journal.com/12345",
        "2. Made Up et al. (2023). Hallucinated Title. https://not-real.org/abc",
        "3. Generated Reference. https://this-domain-does-not-exist-12345.com/paper"
    ]
    return refs + "\n" + "\n".join(random.sample(fake_refs, random.randint(1, 3)))

def corrupt_tense(text: str) -> str:
    """Change past tense to present tense."""
    replacements = [
        (r"\bwas\b", "is"), (r"\bwere\b", "are"), (r"\bshowed\b", "shows"),
        (r"\bobserved\b", "observes"), (r"\bmeasured\b", "measures"),
        (r"\bdetermined\b", "determines"), (r"\bconfirmed\b", "confirms"),
        (r"\bdemonstrated\b", "demonstrates"), (r"\bconducted\b", "conducts"),
        (r"\bperformed\b", "performs"), (r"\banalyzed\b", "analyzes"),
    ]
    result = text
    for old, new in replacements:
        result = re.sub(old, new, result, flags=re.IGNORECASE)
    return result

def create_corrupted_report(clean_sections: Dict[str, str], iv_path: str) -> Dict[str, Any]:
    """Create a corrupted version with random issues."""
    corrupted = {}
    issues = []
    
    for section, content in clean_sections.items():
        if section in ["discussion", "conclusion", "introduction", "theory"]:
            if random.random() < 0.5:
                content = inject_repetition(content)
                issues.append(f"repetition_in_{section}")
            if random.random() < 0.3:
                content = corrupt_tense(content)
                issues.append(f"tense_error_in_{section}")
        elif section in ["result", "data_table", "data"]:
            if random.random() < 0.5:
                content = inject_data_mismatch(content, iv_path)
                issues.append("data_mismatch")
        elif section in ["references"]:
            if random.random() < 0.5:
                content = corrupt_references(content)
                issues.append("fake_references")
        corrupted[section] = content
    
    # Randomly remove sections
    if random.random() < 0.3:
        corrupted = remove_sections(corrupted)
        issues.append("missing_sections")
    
    return {"sections": corrupted, "injected_issues": issues}

def extract_features_from_sections(sections: Dict[str, str], iv_path: str = "") -> Dict[str, float]:
    """Extract the same features our validators produce."""
    import pandas as pd
    import numpy as np
    
    # Text features
    def repetition_score(text: str) -> float:
        sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
        if len(sentences) < 2:
            return 0.0
        all_ngrams = []
        for s in sentences:
            tokens = s.lower().split()
            all_ngrams.extend([tuple(tokens[i:i+3]) for i in range(len(tokens)-2)])
        if not all_ngrams:
            return 0.0
        from collections import Counter
        counts = Counter(all_ngrams)
        repeated = sum(c for c in counts.values() if c > 1)
        return repeated / len(all_ngrams)
    
    def word_count(text: str) -> int:
        return len(text.split())
    
    def tense_violations(text: str) -> int:
        try:
            import spacy
            nlp = spacy.load("en_core_web_sm")
            doc = nlp(text)
            violations = 0
            for token in doc:
                if token.pos_ == "VERB" and token.tag_ in ("VBP", "VBZ", "VBG"):
                    if token.dep_ not in ("aux", "auxpass"):
                        violations += 1
            return violations
        except:
            return 0
    
    def objectives_compliance(obj_text: str) -> float:
        lines = [l.strip() for l in obj_text.splitlines() if l.strip()]
        if not lines:
            return 0.0
        valid = sum(1 for l in lines if l.lower().startswith("to ") or l.lower().startswith("1. to ") or l.lower().startswith("2. to "))
        return valid / len(lines)
    
    # Data features
    def parse_table(latex: str):
        rows = []
        in_tabular = False
        for line in latex.splitlines():
            line = line.strip()
            if line.startswith("\\begin{tabular}"):
                in_tabular = True
                continue
            if line.startswith("\\end{tabular}"):
                in_tabular = False
                continue
            if not in_tabular or line.startswith("\\") or "hline" in line:
                continue
            parts = [p.strip() for p in line.split("&")]
            if len(parts) >= 2:
                try:
                    v = float(re.sub(r"[^\d\.\-eE]", "", parts[0]))
                    i = float(re.sub(r"[^\d\.\-eE]", "", parts[1]))
                    rows.append((v, i))
                except:
                    pass
        return rows
    
    def load_iv(path: str):
        try:
            df = pd.read_csv(path, sep=r"\s+", header=None)
            if df.shape[1] >= 4:
                v = pd.concat([df[0], df[2]]).reset_index(drop=True)
                i = pd.concat([df[1], df[3]]).reset_index(drop=True)
            else:
                v, i = df[0], df[1]
            return pd.DataFrame({"V": v, "I": i}).sort_values("V").reset_index(drop=True)
        except:
            return None
    
    def interpolate(sim_df, target_v):
        if sim_df is None or sim_df.empty:
            return None
        v = sim_df["V"].values
        i = sim_df["I"].values
        if target_v <= v[0]: return float(i[0])
        if target_v >= v[-1]: return float(i[-1])
        idx = np.searchsorted(v, target_v)
        if idx == 0: return float(i[0])
        if idx == len(v): return float(i[-1])
        v0, v1 = v[idx-1], v[idx]
        i0, i1 = i[idx-1], i[idx]
        return float(i0 + (i1 - i0) * (target_v - v0) / (v1 - v0))
    
    # Extract features
    intro = sections.get("introduction", "") or sections.get("theory", "")
    discussion = sections.get("discussion", "")
    conclusion = sections.get("conclusion", "")
    objectives_text = sections.get("objectives", "")
    table_latex = sections.get("result", "") or sections.get("data_table", "") or sections.get("data", "")
    
    table_rows = parse_table(table_latex)
    sim_df = load_iv(iv_path) if iv_path else None
    
    feat = {
        "repetition_score": max(repetition_score(intro), repetition_score(discussion), repetition_score(conclusion)),
        "intro_words": float(word_count(intro)),
        "discussion_words": float(word_count(discussion)),
        "conclusion_words": float(word_count(conclusion)),
        "tense_violations": float(tense_violations(discussion) + tense_violations(conclusion)),
        "objectives_compliance": objectives_compliance(objectives_text),
        "table_rows": float(len(table_rows)),
        "sim_match_rate": 1.0,
        "max_rel_error": 0.0,
        "impossible_values_flag": 0.0,
    }
    
    if table_rows and sim_df is not None:
        mismatches = 0
        max_err = 0.0
        for v_claimed, i_claimed in table_rows:
            i_actual = interpolate(sim_df, v_claimed)
            if i_actual is None: continue
            rel_err = abs(i_claimed - i_actual * 1000) / max(abs(i_actual * 1000), 0.001) * 100
            if rel_err > 20: mismatches += 1
            max_err = max(max_err, rel_err)
        feat["sim_match_rate"] = 1.0 - mismatches / len(table_rows) if table_rows else 1.0
        feat["max_rel_error"] = max_err
    
    # Structure features
    required = ["objectives", "theory", "circuit_design", "apparatus", "procedure", "data_table_latex", "discussion", "conclusion", "references"]
    bitmap = sum(1 << i for i, s in enumerate(required) if s in sections)
    feat["section_bitmap"] = float(bitmap)
    feat["figure_count"] = 0.0
    feat["apparatus_count"] = 0.0
    feat["ref_count"] = float(len([l for l in sections.get("references", "").splitlines() if l.strip()]))
    
    # Circuit features
    feat["netlist_apparatus_overlap"] = 0.0
    feat["schemdraw_valid"] = 0.0
    
    # Reference features
    feat["url_validity_rate"] = 1.0
    feat["ref_research_overlap"] = 0.0
    
    # Semantics (LLM) features - default 0 for synthetic
    feat["llm_violation_count"] = 0.0
    feat["llm_high_sev_count"] = 0.0
    feat["llm_medium_sev_count"] = 0.0
    feat["llm_physics_error_flag"] = 0.0
    
    return feat

def main():
    print("Loading clean reports...")
    clean_reports = load_clean_reports(RAG_DIR)
    print(f"Loaded {len(clean_reports)} clean reports")
    
    all_features = []
    all_labels = []
    
    for report in clean_reports:
        sections = parse_sections(report["content"])
        
        # Clean version (label 0)
        feat = extract_features_from_sections(sections, IV_DATA_PATH)
        all_features.append(feat)
        all_labels.append(0)
        
        # Generate 3-5 corrupted versions per clean report
        for _ in range(random.randint(3, 5)):
            corrupted = create_corrupted_report(sections, IV_DATA_PATH)
            feat = extract_features_from_sections(corrupted["sections"], IV_DATA_PATH)
            all_features.append(feat)
            all_labels.append(1)
    
    import pandas as pd
    import numpy as np
    
    feature_names = sorted(set().union(*[f.keys() for f in all_features]))
    X = pd.DataFrame(all_features, columns=feature_names).fillna(0)
    y = np.array(all_labels)
    
    print(f"Generated {len(X)} samples ({sum(y)} corrupted, {len(y)-sum(y)} clean)")
    print(f"Features: {len(feature_names)}")
    
    # Train LightGBM
    import lightgbm as lgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, roc_auc_score
    
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    val_data = lgb.Dataset(X_val, label=y_val, feature_name=feature_names, reference=train_data)
    
    params = {
        "objective": "binary",
        "metric": "auc",
        "boosting_type": "gbdt",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "seed": 42,
    }
    
    print("Training LightGBM...")
    model = lgb.train(
        params,
        train_data,
        num_boost_round=500,
        valid_sets=[val_data],
        callbacks=[lgb.early_stopping(50), lgb.log_evaluation(50)]
    )
    
    y_pred_prob = model.predict(X_val, num_iteration=model.best_iteration)
    y_pred = (y_pred_prob > 0.5).astype(int)
    
    print("\nValidation Results:")
    print(classification_report(y_val, y_pred))
    print(f"ROC-AUC: {roc_auc_score(y_val, y_pred_prob):.4f}")
    
    # Save model
    model_path = os.path.join(OUTPUT_DIR, "verifier_classifier.txt")
    feature_path = os.path.join(OUTPUT_DIR, "feature_names.json")
    model.save_model(model_path)
    with open(feature_path, "w") as f:
        json.dump(feature_names, f, indent=2)
    
    print(f"\nModel saved to {model_path}")
    print(f"Feature names saved to {feature_path}")
    
    # Copy to labgen/models for production use
    import shutil
    shutil.copy2(model_path, "/home/sword/Documents/LAB_Expert/labgen/models/verifier_classifier.txt")
    shutil.copy2(feature_path, "/home/sword/Documents/LAB_Expert/labgen/models/feature_names.json")
    print("Copied to labgen/models/")
    
    # Feature importance
    importance = pd.DataFrame({
        "feature": feature_names,
        "importance": model.feature_importance(importance_type="gain")
    }).sort_values("importance", ascending=False)
    print("\nTop 15 Features:")
    print(importance.head(15).to_string(index=False))

if __name__ == "__main__":
    main()