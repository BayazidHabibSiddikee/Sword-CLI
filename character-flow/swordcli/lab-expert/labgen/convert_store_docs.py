#!/usr/bin/env python3
"""
Convert DOCX/PDF files in store/ to Markdown for RAG and training data.
Uses web-scraper's markitdown_convert.py
"""

import os
import sys
import subprocess
import json
from pathlib import Path

WEB_SCRAPER_PATH = "/home/sword/Documents/web-scraper"
STORE_DIR = "/home/sword/Documents/LAB_Expert/store"
OUTPUT_DIR = "/home/sword/Documents/LAB_Expert/labgen/rag_data"

MARKITDOWN_SCRIPT = os.path.join(WEB_SCRAPER_PATH, "examples", "content_extract", "markitdown_convert.py")

def convert_batch(input_dir: str, output_dir: str) -> list:
    os.makedirs(output_dir, exist_ok=True)
    input_abs = os.path.abspath(input_dir)
    output_abs = os.path.abspath(output_dir)
    print(f"Converting all files in {input_abs} recursively...")
    try:
        result = subprocess.run(
            ["python", MARKITDOWN_SCRIPT, input_abs, "-r", "-o", output_abs],
            capture_output=True, text=True, timeout=600, cwd=WEB_SCRAPER_PATH
        )
        if result.returncode == 0:
            print(result.stdout)
            results = []
            for md_file in Path(output_abs).rglob("*.md"):
                with open(md_file, "r") as f:
                    content = f.read()
                results.append({"status": "success", "input": str(md_file), "output": str(md_file), "content": content})
            return results
        else:
            print(f"Error: {result.stderr}")
            return [{"status": "error", "input": input_abs, "error": result.stderr}]
    except Exception as e:
        return [{"status": "error", "input": input_abs, "error": str(e)}]

def build_training_data(rag_dir: str, output_jsonl: str):
    """Build JSONL for classifier training from converted markdown files."""
    training_data = []
    for md_file in Path(rag_dir).rglob("*.md"):
        with open(md_file, "r") as f:
            content = f.read()
        training_data.append({
            "text": content,
            "source": md_file.name,
            "path": str(md_file)
        })
    with open(output_jsonl, "w") as f:
        for item in training_data:
            f.write(json.dumps(item) + "\n")
    print(f"Saved {len(training_data)} documents to {output_jsonl}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Convert store/ docs to markdown for RAG/training")
    parser.add_argument("--input-dir", default=STORE_DIR, help="Input directory with PDFs/DOCX")
    parser.add_argument("--output-dir", default=OUTPUT_DIR, help="Output directory for markdown")
    parser.add_argument("--training-output", default=os.path.join(OUTPUT_DIR, "training_data.jsonl"), help="Training data JSONL")
    args = parser.parse_args()

    if not os.path.exists(MARKITDOWN_SCRIPT):
        print(f"markitdown script not found at {MARKITDOWN_SCRIPT}")
        sys.exit(1)

    if not os.path.exists(args.input_dir):
        print(f"Input directory {args.input_dir} does not exist")
        sys.exit(1)

    print(f"Converting files from {args.input_dir} to {args.output_dir}...")
    results = convert_batch(args.input_dir, args.output_dir)

    success = sum(1 for r in results if r["status"] == "success")
    print(f"\nConverted {success}/{len(results)} files")

    if success > 0:
        build_training_data(args.output_dir, args.training_output)