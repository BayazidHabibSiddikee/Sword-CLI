#!/usr/bin/env python3
"""
Train LightGBM classifier for lab report verification.
Usage:
  python train_classifier.py --input-dir /path/to/pdfs --output-dir models/
  # Or on Kaggle: upload PDFs, run this, download model.txt + feature_names.json
"""

import argparse
import json
import os
import sys
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

sys.path.insert(0, os.path.dirname(__file__))
from pipeline.ingest import extract_pdf, extract_pdf_batch
from pipeline.verify import extract_features, ALL_VALIDATORS

warnings.filterwarnings("ignore")

def collect_pdf_features(pdf_dir: str) -> tuple:
    print(f"Scanning {pdf_dir} for PDFs...")
    pdf_files = list(Path(pdf_dir).rglob("*.pdf")) + list(Path(pdf_dir).rglob("*.PDF"))
    print(f"Found {len(pdf_files)} PDFs")

    if len(pdf_files) == 0:
        print("No PDFs found!")
        return None, None

    all_features = []
    all_labels = []
    metadata = []

    for pdf_path in pdf_files:
        try:
            print(f"Processing {pdf_path.name}...")
            extracted = extract_pdf(str(pdf_path))
            if "error" in extracted:
                print(f"  Error: {extracted['error']}")
                continue

            sections = extracted.get("sections", {})
            latex_table = extracted.get("latex_table", "")
            if latex_table:
                sections["data_table_latex"] = latex_table

            report_bundle = {
                "experiment_name": pdf_path.stem,
                "sections": sections,
                "circuit_json": {},
                "iv_data_path": "",
                "research_context": "",
                "settings": {},
                "plots": []
            }

            features = extract_features(report_bundle)
            all_features.append(features)
            metadata.append({"file": pdf_path.name})

            label = 0
            if features.get("repetition_score", 0) > 0.3:
                label = 1
            if features.get("sim_match_rate", 1.0) < 0.8:
                label = 1
            if features.get("llm_violation_count", 0) > 0:
                label = 1
            if features.get("url_validity_rate", 1.0) < 0.5:
                label = 1

            all_labels.append(label)

        except Exception as e:
            print(f"  Failed: {e}")
            continue

    if not all_features:
        return None, None

    feature_names = sorted(set().union(*[f.keys() for f in all_features]))
    X = pd.DataFrame(all_features, columns=feature_names).fillna(0)
    y = np.array(all_labels)

    return X, y, feature_names, metadata

def train_model(X, y, feature_names, output_dir: str):
    print(f"Training on {len(X)} samples, {len(feature_names)} features")
    print(f"Label distribution: {np.bincount(y)}")

    if len(X) < 5:
        print("Small dataset: training on all data without validation split")
        X_train, X_val = X, X
        y_train, y_val = y, y
        valid_sets = None
        callbacks = None
        num_rounds = 100
    else:
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
        )
        valid_sets = []
        callbacks = [lgb.early_stopping(50), lgb.log_evaluation(50)]
        num_rounds = 500

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    if valid_sets is not None:
        val_data = lgb.Dataset(X_val, label=y_val, feature_name=feature_names, reference=train_data)
        valid_sets = [val_data]

    params = {
        "objective": "binary",
        "metric": "auc",
        "boosting_type": "gbdt",
        "num_leaves": min(31, max(2, len(X_train) - 1)),
        "learning_rate": 0.05,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "seed": 42,
    }

    model = lgb.train(
        params,
        train_data,
        num_boost_round=num_rounds,
        valid_sets=valid_sets,
        callbacks=callbacks
    )

    if valid_sets is not None:
        y_pred_prob = model.predict(X_val, num_iteration=model.best_iteration)
        y_pred = (y_pred_prob > 0.5).astype(int)
        print("\nValidation Results:")
        print(classification_report(y_val, y_pred))
        print(f"ROC-AUC: {roc_auc_score(y_val, y_pred_prob):.4f}")

    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "verifier_classifier.txt")
    feature_path = os.path.join(output_dir, "feature_names.json")

    model.save_model(model_path)
    with open(feature_path, "w") as f:
        json.dump(feature_names, f, indent=2)

    print(f"\nModel saved to {model_path}")
    print(f"Feature names saved to {feature_path}")

    importance = pd.DataFrame({
        "feature": feature_names,
        "importance": model.feature_importance(importance_type="gain")
    }).sort_values("importance", ascending=False)
    print("\nTop 15 Features:")
    print(importance.head(15).to_string(index=False))

    return model, feature_names

def main():
    parser = argparse.ArgumentParser(description="Train LabGen verification classifier")
    parser.add_argument("--input-dir", required=True, help="Directory containing PDFs")
    parser.add_argument("--output-dir", default="models", help="Output directory for model")
    parser.add_argument("--labels-file", help="Optional CSV with filename,label for supervised labels")
    args = parser.parse_args()

    X, y, feature_names, metadata = collect_pdf_features(args.input_dir)
    if X is None:
        print("No valid features extracted. Exiting.")
        return

    if args.labels_file and os.path.exists(args.labels_file):
        labels_df = pd.read_csv(args.labels_file)
        label_map = dict(zip(labels_df["filename"], labels_df["label"]))
        y = np.array([label_map.get(m["file"], 0) for m in metadata])
        print(f"Loaded {len(labels_df)} supervised labels")

    train_model(X, y, feature_names, args.output_dir)

if __name__ == "__main__":
    main()