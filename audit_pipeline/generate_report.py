"""
Step 4 — Render (programmatic generation).

Takes the structured JSON verdict from analyze.py and drops it into a
pre-built ReportLab template. No LLM tokens are spent formatting the PDF —
layout, color, and typography are all defined here in code, so every report
looks identical and professional regardless of what the model returned.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

NAVY = colors.HexColor("#1a1a2e")
RED = colors.HexColor("#c0392b")
GREEN = colors.HexColor("#27ae60")
ROW_ALT = colors.HexColor("#f4f4f8")


def generate_audit_report(audit_result: dict, output_path: str | Path, vendor_name: str = "Vendor") -> str:
    output_path = str(output_path)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("AuditTitle", parent=styles["Title"], textColor=NAVY)
    meta_style = ParagraphStyle("AuditMeta", parent=styles["Normal"], textColor=colors.grey)

    is_flagged = audit_result["status"] == "Flagged"
    status_style = ParagraphStyle(
        "AuditStatus", parent=styles["Heading2"], textColor=RED if is_flagged else GREEN
    )

    story = [
        Paragraph("Compliance Audit Report", title_style),
        Paragraph(f"Vendor: {vendor_name} &nbsp;|&nbsp; Date: {date.today().isoformat()}", meta_style),
        Spacer(1, 0.25 * inch),
        Paragraph(f"Status: {audit_result['status']}", status_style),
        Spacer(1, 0.1 * inch),
        Paragraph(audit_result["summary"], styles["Normal"]),
        Spacer(1, 0.2 * inch),
        Paragraph(f"<b>Savings Identified:</b> ${audit_result['savings_identified']:,.2f}", styles["Normal"]),
        Spacer(1, 0.3 * inch),
    ]

    discrepancies = audit_result.get("discrepancies", [])
    if discrepancies:
        story.append(Paragraph("Discrepancies Found", styles["Heading2"]))
        story.append(Spacer(1, 0.1 * inch))

        table_data = [["Line Item", "Issue", "Invoice", "Purchase Order"]]
        for d in discrepancies:
            table_data.append([d["line_item"], d["issue"], d["invoice_value"], d["po_value"]])

        table = Table(table_data, colWidths=[1.4 * inch, 2.3 * inch, 1.15 * inch, 1.15 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(table)
    else:
        story.append(Paragraph("No discrepancies found. All line items reconcile.", styles["Normal"]))

    doc.build(story)
    return output_path
