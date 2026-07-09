import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { performThreeWayMatch, MatchInput } from '@/lib/matching-engine'
import { ExtractedDocument } from '@/lib/llm'

function parseData(doc: { extractedData: string | null }): ExtractedDocument | null {
  if (!doc.extractedData) return null
  try { return JSON.parse(doc.extractedData) as ExtractedDocument } catch { return null }
}

function toMatchInput(doc: any, data: ExtractedDocument): MatchInput {
  return {
    type: doc.fileType,
    documentId: doc.id,
    filename: doc.filename,
    vendorName: data.vendorName,
    items: data.items || [],
    totalAmount: doc.amount,
    taxAmount: data.taxAmount,
    documentNumber: data.documentNumber,
    documentDate: data.documentDate,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const targetDoc = await db.document.findUnique({ where: { id } })
    if (!targetDoc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const targetData = parseData(targetDoc)
    if (!targetData) return NextResponse.json({ error: 'No extraction data' }, { status: 404 })

    // Find all other documents from same vendor
    const allDocs = await db.document.findMany({
      where: { id: { not: id } },
    })

    let po: MatchInput | null = null
    let grn: MatchInput | null = null
    let invoice: MatchInput | null = null

    for (const doc of allDocs) {
      const data = parseData(doc)
      if (!data) continue
      const sameVendor = targetData.vendorName && data.vendorName &&
        targetData.vendorName.toLowerCase() === data.vendorName.toLowerCase()
      if (!sameVendor) continue

      if (doc.fileType === 'po') po = toMatchInput(doc, data)
      if (doc.fileType === 'grn') grn = toMatchInput(doc, data)
      if (doc.fileType === 'invoice' && doc.id !== id) invoice = toMatchInput(doc, data)
    }

    if (!po && !grn && !invoice) {
      return NextResponse.json({
        success: true,
        comparison: null,
        message: 'No related documents found for comparison. Upload a PO, GRN, or Invoice from the same vendor.',
      })
    }

    const result = await performThreeWayMatch(po, grn, invoice)

    return NextResponse.json({
      success: true,
      comparison: {
        po: po ? { documentId: po.documentId, filename: po.filename, documentNumber: po.documentNumber, totalAmount: po.totalAmount } : null,
        grn: grn ? { documentId: grn.documentId, filename: grn.filename, documentNumber: grn.documentNumber, totalAmount: grn.totalAmount } : null,
        invoice: invoice ? { documentId: invoice.documentId, filename: invoice.filename, documentNumber: invoice.documentNumber, totalAmount: invoice.totalAmount } : null,
        matchStatus: result.matchStatus,
        confidenceScore: result.confidenceScore,
        discrepancies: result.discrepancies,
        lineItemComparison: result.lineItemComparison,
        summary: result.summary,
      },
    })
  } catch (error) {
    console.error('Comparison API error:', error)
    return NextResponse.json({ error: 'Comparison failed' }, { status: 500 })
  }
}