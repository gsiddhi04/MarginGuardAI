"""
Step 1 — Ingest.

In production this is where a UIA/RPA script (e.g. UiPath, Playwright,
Selenium) logs into a vendor or ERP portal and downloads the Invoice,
Purchase Order, and Contract PDFs to local disk. That part is specific to
whatever portal you're scraping, so it isn't implemented here — this module
just validates that the files an upstream RPA step (or a human) dropped in
are present and readable before the pipeline spends any tokens on them.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class DocumentSet:
    invoice_path: Path
    po_path: Path
    contract_path: Path | None = None


def collect_documents(invoice_path: str, po_path: str, contract_path: str | None = None) -> DocumentSet:
    invoice = Path(invoice_path)
    po = Path(po_path)
    contract = Path(contract_path) if contract_path else None

    for label, path in (("invoice", invoice), ("purchase order", po)):
        if not path.is_file():
            raise FileNotFoundError(f"{label} not found: {path}")

    if contract is not None and not contract.is_file():
        raise FileNotFoundError(f"contract not found: {contract}")

    return DocumentSet(invoice_path=invoice, po_path=po, contract_path=contract)
