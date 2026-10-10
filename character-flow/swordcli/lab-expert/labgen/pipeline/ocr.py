#!/usr/bin/env python3
"""
OCR module for RAG pipeline - extracts text from scanned PDFs/images.
Uses pdf2image + pytesseract (or paddleocr if available).
"""

import os
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any

# Try to import OCR dependencies
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from paddleocr import PaddleOCR
    PADDLEOCR_AVAILABLE = True
except ImportError:
    PADDLEOCR_AVAILABLE = False


class OCREngine:
    """Unified OCR engine supporting multiple backends."""

    def __init__(self, lang: str = "eng", use_paddle: bool = False):
        self.lang = lang
        self.use_paddle = use_paddle and PADDLEOCR_AVAILABLE
        self._paddle_ocr = None

        if self.use_paddle:
            try:
                self._paddle_ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
            except Exception as e:
                print(f"[OCR] PaddleOCR init failed: {e}, falling back to tesseract")
                self.use_paddle = False

        if not self.use_paddle and not TESSERACT_AVAILABLE:
            raise RuntimeError("No OCR backend available. Install pytesseract or paddleocr.")

    def ocr_image(self, image_path: str) -> str:
        """Extract text from a single image file."""
        if self.use_paddle and self._paddle_ocr:
            try:
                result = self._paddle_ocr.ocr(image_path, cls=True)
                texts = []
                for line in result:
                    if line:
                        for word_info in line:
                            texts.append(word_info[1][0])
                return "\n".join(texts)
            except Exception as e:
                print(f"[OCR] PaddleOCR failed: {e}, trying tesseract")

        # Fallback to tesseract
        if TESSERACT_AVAILABLE:
            try:
                from PIL import Image
                img = Image.open(image_path)
                return pytesseract.image_to_string(img, lang=self.lang)
            except Exception as e:
                raise RuntimeError(f"Tesseract OCR failed: {e}")

        raise RuntimeError("No working OCR backend")

    def ocr_pdf(self, pdf_path: str, dpi: int = 200, max_pages: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        OCR a PDF file page by page.
        Returns list of dicts with page_number, text, and image_path.
        """
        if not PDF2IMAGE_AVAILABLE:
            raise RuntimeError("pdf2image not installed. pip install pdf2image")

        results = []
        try:
            images = convert_from_path(pdf_path, dpi=dpi)
        except Exception as e:
            raise RuntimeError(f"pdf2image conversion failed: {e}")

        for i, image in enumerate(images):
            if max_pages and i >= max_pages:
                break

            # Save page as temporary image for OCR
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                image.save(tmp.name, "PNG")
                text = self.ocr_image(tmp.name)
                os.unlink(tmp.name)

            results.append({
                "page_number": i + 1,
                "text": text.strip(),
                "char_count": len(text.strip())
            })

        return results

    def is_scanned_pdf(self, pdf_path: str, threshold: int = 100) -> bool:
        """
        Quick check if PDF is scanned (has little/no extractable text).
        Uses PyMuPDF to check text content.
        """
        if not PYMUPDF_AVAILABLE:
            return False

        try:
            doc = fitz.open(pdf_path)
            total_chars = 0
            for page in doc:
                text = page.get_text()
                total_chars += len(text.strip())
            doc.close()

            # If very little text across all pages, likely scanned
            return total_chars < threshold
        except Exception:
            return False


def extract_text_with_ocr(pdf_path: str, lang: str = "eng", dpi: int = 200) -> Dict[str, Any]:
    """
    Main entry point: extract text from PDF using OCR if needed.
    Returns dict with extracted text, method used, and page details.
    """
    engine = OCREngine(lang=lang)

    # Check if PDF is scanned
    is_scanned = engine.is_scanned_pdf(pdf_path)

    if is_scanned:
        print(f"[OCR] Detected scanned PDF: {pdf_path}")
        pages = engine.ocr_pdf(pdf_path, dpi=dpi)
        full_text = "\n\n".join([p["text"] for p in pages if p["text"].strip()])
        return {
            "method": "ocr",
            "text": full_text,
            "pages": pages,
            "total_chars": len(full_text),
            "scanned": True
        }
    else:
        # Try regular text extraction first (PyMuPDF)
        if PYMUPDF_AVAILABLE:
            try:
                doc = fitz.open(pdf_path)
                texts = []
                for page in doc:
                    texts.append(page.get_text())
                doc.close()
                full_text = "\n\n".join(texts)
                if full_text.strip():
                    return {
                        "method": "pymupdf",
                        "text": full_text,
                        "pages": [{"page_number": i+1, "text": t, "char_count": len(t)} for i, t in enumerate(texts)],
                        "total_chars": len(full_text),
                        "scanned": False
                    }
            except Exception as e:
                print(f"[OCR] PyMuPDF extraction failed: {e}")

        # Fallback to OCR
        print(f"[OCR] Falling back to OCR for: {pdf_path}")
        pages = engine.ocr_pdf(pdf_path, dpi=dpi)
        full_text = "\n\n".join([p["text"] for p in pages if p["text"].strip()])
        return {
            "method": "ocr",
            "text": full_text,
            "pages": pages,
            "total_chars": len(full_text),
            "scanned": True
        }


def batch_ocr_pdfs(input_dir: str, output_dir: str, lang: str = "eng", dpi: int = 200) -> Dict[str, Any]:
    """Process all PDFs in a directory with OCR."""
    os.makedirs(output_dir, exist_ok=True)
    engine = OCREngine(lang=lang)

    results = {}
    for pdf_file in Path(input_dir).glob("*.pdf"):
        print(f"[OCR] Processing {pdf_file.name}...")
        try:
            result = extract_text_with_ocr(str(pdf_file), lang=lang, dpi=dpi)
            output_file = Path(output_dir) / f"{pdf_file.stem}_ocr.txt"
            with open(output_file, "w") as f:
                f.write(result["text"])
            results[pdf_file.name] = {"status": "success", "output": str(output_file), **result}
        except Exception as e:
            results[pdf_file.name] = {"status": "error", "error": str(e)}

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="OCR PDFs for RAG")
    parser.add_argument("input", help="PDF file or directory")
    parser.add_argument("-o", "--output", help="Output directory (for batch)")
    parser.add_argument("--lang", default="eng", help="OCR language")
    parser.add_argument("--dpi", type=int, default=200, help="DPI for PDF rendering")
    args = parser.parse_args()

    if os.path.isdir(args.input):
        if not args.output:
            args.output = args.input + "_ocr"
        batch_ocr_pdfs(args.input, args.output, args.lang, args.dpi)
    else:
        result = extract_text_with_ocr(args.input, args.lang, args.dpi)
        print(f"Method: {result['method']}")
        print(f"Scanned: {result['scanned']}")
        print(f"Chars: {result['total_chars']}")
        print(result["text"][:2000])