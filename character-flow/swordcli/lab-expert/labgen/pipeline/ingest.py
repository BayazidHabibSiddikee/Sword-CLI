import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

WEB_SCRAPER_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "web-scraper")

def _run_markitdown(pdf_path: str) -> Optional[str]:
    script = os.path.join(WEB_SCRAPER_PATH, "examples", "content_extract", "markitdown_convert.py")
    if not os.path.exists(script):
        return None
    try:
        result = subprocess.run(
            ["python", script, pdf_path],
            capture_output=True, text=True, timeout=120, cwd=WEB_SCRAPER_PATH
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout
    except Exception:
        pass
    return None

def _run_markitdown_recursive(dir_path: str) -> Dict[str, str]:
    script = os.path.join(WEB_SCRAPER_PATH, "examples", "content_extract", "markitdown_convert.py")
    if not os.path.exists(script):
        return {}
    try:
        result = subprocess.run(
            ["python", script, dir_path, "--recursive"],
            capture_output=True, text=True, timeout=300, cwd=WEB_SCRAPER_PATH
        )
        outputs = {}
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                if "->" in line:
                    src, dst = line.split("->", 1)
                    src = src.strip()
                    dst = dst.strip()
                    if os.path.exists(dst):
                        with open(dst, "r") as f:
                            outputs[src] = f.read()
        return outputs
    except Exception:
        return {}

def _extract_tables_pdfplumber(pdf_path: str) -> List[Dict]:
    tables = []
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                extracted = page.extract_tables()
                for table_idx, table in enumerate(extracted):
                    if table and len(table) > 1:
                        headers = [str(c).strip() if c else "" for c in table[0]]
                        rows = []
                        for row in table[1:]:
                            rows.append([str(c).strip() if c else "" for c in row])
                        tables.append({
                            "page": page_num + 1,
                            "table_index": table_idx,
                            "headers": headers,
                            "rows": rows
                        })
    except Exception:
        pass
    return tables

def _extract_text_pymupdf(pdf_path: str) -> str:
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text = []
        for page in doc:
            text.append(page.get_text())
        doc.close()
        return "\n".join(text)
    except Exception:
        return ""

def _guess_sections(text: str) -> Dict[str, str]:
    sections = {}
    current = "unknown"
    buffer = []
    section_pattern = re.compile(r"^(?:\\section\{|\\section\*?\{)?([A-Za-z ]+)(?:\})?$", re.MULTILINE)

    lines = text.splitlines()
    for line in lines:
        m = section_pattern.match(line.strip())
        if m:
            if buffer:
                sections[current] = "\n".join(buffer).strip()
            current = m.group(1).lower().replace(" ", "_")
            buffer = []
        else:
            buffer.append(line)
    if buffer:
        sections[current] = "\n".join(buffer).strip()

    return sections

def _extract_latex_table(text: str) -> str:
    in_tabular = False
    table_lines = []
    for line in text.splitlines():
        if "\\begin{tabular}" in line:
            in_tabular = True
        if in_tabular:
            table_lines.append(line)
        if in_tabular and "\\end{tabular}" in line:
            break
    return "\n".join(table_lines)

from pipeline.ocr import extract_text_with_ocr

def extract_pdf(pdf_path: str) -> Dict[str, Any]:
    if not os.path.exists(pdf_path):
        return {"error": "File not found"}

    # Use OCR-enabled extraction
    ocr_result = extract_text_with_ocr(pdf_path)
    markdown = ocr_result.get("text", "")
    method = ocr_result.get("method", "unknown")

    # Also try markitdown for comparison
    markitdown_md = _run_markitdown(pdf_path)
    if markitdown_md and len(markitdown_md) > len(markdown):
        markdown = markitdown_md

    tables = _extract_tables_pdfplumber(pdf_path)
    sections = _guess_sections(markdown)
    latex_table = _extract_latex_table(markdown)

    return {
        "source_path": pdf_path,
        "markdown": markdown,
        "sections": sections,
        "tables": tables,
        "latex_table": latex_table,
        "ocr_method": method,
        "ocr_scanned": ocr_result.get("scanned", False),
        "ocr_pages": ocr_result.get("pages", []),
        "metadata": {
            "pages": len(ocr_result.get("pages", [])),
            "has_tables": len(tables) > 0,
            "section_count": len(sections),
            "extraction_method": method
        }
    }

def extract_pdf_batch(dir_path: str) -> Dict[str, Dict[str, Any]]:
    results = {}
    for ext in (".pdf", ".PDF"):
        for pdf_file in Path(dir_path).rglob(f"*{ext}"):
            results[str(pdf_file)] = extract_pdf(str(pdf_file))
    return results