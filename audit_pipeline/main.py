"""
Orchestrates the full pipeline: Ingest -> Parse -> Analyze -> Render.

Usage:
    python main.py <invoice.pdf> <purchase_order.pdf> [contract.pdf]

Requires ANTHROPIC_API_KEY to be set in the environment (or an
`ant auth login` profile — see the Anthropic CLI docs).
"""

from __future__ import annotations

import sys
from pathlib import Path

from analyze import analyze_documents
from generate_report import generate_audit_report
from ingest import collect_documents
from parse_documents import parse_pdf_to_markdown

OUTPUT_DIR = Path(__file__).parent.parent / "reports"


def run_pipeline(invoice_path: str, po_path: str, contract_path: str | None = None) -> tuple[dict, str]:
    docs = collect_documents(invoice_path, po_path, contract_path)

    invoice_md = parse_pdf_to_markdown(docs.invoice_path)
    po_md = parse_pdf_to_markdown(docs.po_path)
    contract_md = parse_pdf_to_markdown(docs.contract_path) if docs.contract_path else None

    audit_result = analyze_documents(invoice_md, po_md, contract_md)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"audit_report_{docs.invoice_path.stem}.pdf"
    generate_audit_report(audit_result, output_path, vendor_name=docs.invoice_path.stem)

    print(f"Status: {audit_result['status']}")
    print(f"Savings identified: ${audit_result['savings_identified']:,.2f}")
    print(f"Discrepancies: {len(audit_result['discrepancies'])}")
    print(f"Report written to: {output_path}")

    return audit_result, str(output_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python main.py <invoice.pdf> <purchase_order.pdf> [contract.pdf]")
        sys.exit(1)

    invoice_arg = sys.argv[1]
    po_arg = sys.argv[2]
    contract_arg = sys.argv[3] if len(sys.argv) > 3 else None

    run_pipeline(invoice_arg, po_arg, contract_arg)
