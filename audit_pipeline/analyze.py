"""
Step 3 — Analyze (LLM logic).

Feeds the parsed Markdown for the Invoice, Purchase Order, and (optionally)
Contract to Claude and asks it to act as a pure cross-referencing engine —
no free-form prose, just a validated JSON object matching AUDIT_SCHEMA. Using
structured outputs (output_config.format) means the response is guaranteed
to parse; there's no need to regex a JSON blob out of chatty text.
"""

from __future__ import annotations

import json

import anthropic
from dotenv import load_dotenv

load_dotenv()

MODEL = "claude-opus-4-8"

AUDIT_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["Approved", "Flagged"]},
        "summary": {"type": "string"},
        "discrepancies": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "line_item": {"type": "string"},
                    "issue": {"type": "string"},
                    "invoice_value": {"type": "string"},
                    "po_value": {"type": "string"},
                },
                "required": ["line_item", "issue", "invoice_value", "po_value"],
                "additionalProperties": False,
            },
        },
        "savings_identified": {"type": "number"},
    },
    "required": ["status", "summary", "discrepancies", "savings_identified"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are a compliance auditor cross-referencing an Invoice, a \
Purchase Order, and (when provided) a Contract. Compare line items, \
quantities, unit prices, and tax calculations across the documents. Flag \
any mismatch, over-billing, or contract violation you find. Only rely on \
the data given to you — never assume a value that isn't present in the \
source documents. If a value can't be verified because a document is \
missing it, say so in the discrepancy rather than guessing."""


def analyze_documents(invoice_md: str, po_md: str, contract_md: str | None = None) -> dict:
    client = anthropic.Anthropic()

    document_sections = [f"# Invoice\n{invoice_md}", f"# Purchase Order\n{po_md}"]
    if contract_md:
        document_sections.append(f"# Contract\n{contract_md}")

    document_sections.append(
        "Cross-reference these documents. Identify every discrepancy in line "
        "items, quantities, unit prices, and tax calculations. Compute the "
        "total dollar amount of any over-billing you catch as "
        "savings_identified (0 if none)."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        output_config={
            "effort": "high",
            "format": {"type": "json_schema", "schema": AUDIT_SCHEMA},
        },
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": "\n\n".join(document_sections)}],
    )

    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)
