#!/usr/bin/env python3
"""render_page.py — single-URL stealth renderer for SwordCLI's fetch_web_rendered tool.

Renders a page with Camoufox (anti-detect headless Firefox) so JavaScript-built
pages are fully hydrated, then converts the DOM into readable Markdown. Output is
one JSON object on stdout, so the Node caller can parse it without scraping logs.

    python3 render_page.py https://example.com --max-chars 12000

Exit code is 0 on success and 1 on failure; ``result.error`` explains the failure.
The URL is SSRF-checked with the vendored ``security_utils.assert_public_url``.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:  # Vendored SSRF guard. The Node caller validates too; belt and braces.
    from security_utils import assert_public_url
except Exception:  # pragma: no cover - guard is best-effort at import time
    def assert_public_url(url: str) -> str:  # type: ignore[misc]
        return url


# Tags whose contents are never readable prose. Void elements (meta/link/source)
# are deliberately excluded: they have no end tag, so counting them here would
# permanently disable extraction.
SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "canvas", "iframe",
             "object", "embed"}
# Tags that start a new visual block.
BLOCK_TAGS = {"p", "div", "section", "article", "header", "footer", "main", "aside",
              "ul", "ol", "table", "tr", "form", "figure", "figcaption", "dl", "dt", "dd"}
HEADINGS = {f"h{i}": "#" * i for i in range(1, 7)}


class MarkdownExtractor(HTMLParser):
    """Convert an HTML document into a compact Markdown-ish text block."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0
        self.document_title = ""
        self._in_title = False
        self._hrefs: list[str] = []
        self._pre = 0
        self._list_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1
            return
        if self.skip:
            return
        attrs = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "br":
            self.parts.append("\n")
        elif tag == "hr":
            self.parts.append("\n\n---\n\n")
        elif tag in HEADINGS:
            self.parts.append(f"\n\n{HEADINGS[tag]} ")
        elif tag in ("ul", "ol"):
            self._list_depth += 1
            self.parts.append("\n")
        elif tag == "li":
            self.parts.append("\n" + "  " * max(self._list_depth - 1, 0) + "- ")
        elif tag == "a":
            self._hrefs.append(str(attrs.get("href", "")))
            self.parts.append("[")
        elif tag == "img":
            self.parts.append(f"![{attrs.get('alt', '')}]({attrs.get('src', '')})")
        elif tag in ("strong", "b"):
            self.parts.append("**")
        elif tag in ("em", "i"):
            self.parts.append("*")
        elif tag == "pre":
            self._pre += 1
            self.parts.append("\n\n```\n")
        elif tag == "code" and not self._pre:
            self.parts.append("`")
        elif tag == "blockquote":
            self.parts.append("\n\n> ")
        elif tag in ("td", "th"):
            self.parts.append(" | ")
        elif tag in BLOCK_TAGS:
            self.parts.append("\n\n")

    def handle_startendtag(self, tag, attrs):
        """Self-closing tags must not unbalance the skip counter."""
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self.skip = max(self.skip - 1, 0)
            return
        if self.skip:
            return
        if tag == "title":
            self._in_title = False
        elif tag in HEADINGS or tag in BLOCK_TAGS:
            self.parts.append("\n\n")
        elif tag in ("ul", "ol"):
            self._list_depth = max(self._list_depth - 1, 0)
            self.parts.append("\n")
        elif tag == "a" and self._hrefs:
            self.parts.append(f"]({self._hrefs.pop()})")
        elif tag in ("strong", "b"):
            self.parts.append("**")
        elif tag in ("em", "i"):
            self.parts.append("*")
        elif tag == "pre":
            self._pre = max(self._pre - 1, 0)
            self.parts.append("\n```\n\n")
        elif tag == "code" and not self._pre:
            self.parts.append("`")

    def handle_data(self, data):
        if self.skip:
            return
        if self._in_title:
            self.document_title += data.strip()
            return
        self.parts.append(data if self._pre else re.sub(r"\s+", " ", data))

    def to_markdown(self) -> str:
        text = "".join(self.parts)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text.strip()


def render(url: str, *, timeout: float, wait_ms: int, max_chars: int) -> dict:
    assert_public_url(url)
    from camoufox.sync_api import Camoufox

    with Camoufox(headless=True) as browser:
        page = browser.new_page()
        page.goto(url, timeout=int(timeout * 1000), wait_until="domcontentloaded")
        page.wait_for_timeout(int(wait_ms))
        title = page.title()
        html = page.content()

    parser = MarkdownExtractor()
    parser.feed(html)
    markdown = parser.to_markdown()
    return {
        "ok": True,
        "url": url,
        "title": title or parser.document_title,
        "backend": "camoufox",
        "markdown": markdown[:max_chars],
        "chars": len(markdown),
        "truncated": len(markdown) > max_chars,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a public page with Camoufox and emit Markdown JSON.")
    parser.add_argument("url")
    parser.add_argument("--max-chars", type=int, default=12000)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--wait-ms", type=int, default=1200)
    args = parser.parse_args()

    result: dict
    try:
        result = render(args.url, timeout=args.timeout, wait_ms=args.wait_ms,
                        max_chars=max(args.max_chars, 1))
    except Exception as exc:  # noqa: BLE001 - the caller needs a readable reason
        result = {"ok": False, "url": args.url, "backend": "camoufox",
                  "error": f"{type(exc).__name__}: {exc}"}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())