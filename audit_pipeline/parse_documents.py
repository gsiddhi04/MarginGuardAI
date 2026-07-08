"""
Step 2 — Parse (cost optimization).

Converts a PDF into clean Markdown (prose as text, tables as Markdown
tables) using pdfplumber — a local, dependency-light layout parser. This is
the "Document AI" step: swap this module for AWS Textract, Azure Document
Intelligence, or Marker if you need OCR on scanned documents or higher
table-extraction fidelity. The point either way is the same — never hand a
raw multi-page PDF to the LLM; hand it a small, structured text blob.
"""

from __future__ import annotations

from pathlib import Path

import pdfplumber


def parse_pdf_to_markdown(pdf_path: str | Path) -> str:
    sections: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                sections.append(f"### Page {page_num}\n{text}")

            for table in page.extract_tables():
                md_table = _table_to_markdown(table)
                if md_table:
                    sections.append(md_table)

    return "\n\n".join(sections)


def _table_to_markdown(table: list[list[str | None]]) -> str:
    if not table or not table[0]:
        return ""

    header = [cell or "" for cell in table[0]]
    rows = table[1:]

    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * len(header)) + " |",
    ]
    for row in rows:
        cells = [(cell or "").replace("\n", " ") for cell in row]
        lines.append("| " + " | ".join(cells) + " |")

    return "\n".join(lines)
