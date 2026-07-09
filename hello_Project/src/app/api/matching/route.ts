import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractTextFromFile, classifyDocument } from '@/lib/ocr'
import { extractDocumentData } from '@/lib/llm'
import { performThreeWayMatch, type MatchInput, type LineItemInput } from '@/lib/matching-engine'

/**
 * Parse an uploaded file or document ID into MatchInput
 */
async function parseInput(input: unknown): Promise<MatchInput | null> {
  // If it's a document ID string
  if (typeof input === 'string') {
    const doc = await db.document.findUnique({
      where: { id: input },
    })
    if (!doc || !doc.extractedData) return null

    const data = JSON.parse(doc.extractedData)
    return {
      type: doc.fileType as MatchInput['type'],
      documentId: doc.id,
      filename: doc.filename,
      vendorName: data.vendorName || '',
      items: (data.items || []).map((item: LineItemInput) => ({
        description: item.description,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || 0,
      })),
      totalAmount: Number(data.totalAmount) || 0,
      taxAmount: Number(data.taxAmount) || 0,
      documentNumber: data.documentNumber || '',
      documentDate: data.documentDate || '',
    }
  }

  return null
}

/**
 * Process a raw uploaded file into MatchInput
 */
async function processUploadedFile(file: File): Promise<MatchInput | null> {
  const text = await extractTextFromFile(file)
  if (!text.trim()) return null

  const fileType = classifyDocument(file.name, text)
  const data = await extractDocumentData(text, fileType)

  return {
    type: fileType as MatchInput['type'],
    filename: file.name,
    vendorName: data.vendorName,
    items: data.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    totalAmount: data.totalAmount,
    taxAmount: data.taxAmount,
    documentNumber: data.documentNumber,
    documentDate: data.documentDate,
    rawText: text,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { po, grn, invoice } = body as {
      po: { type: 'file' | 'documentId'; value: string } | null
      grn: { type: 'file' | 'documentId'; value: string } | null
      invoice: { type: 'file' | 'documentId'; value: string } | null
    }

    let poData: MatchInput | null = null
    let grnData: MatchInput | null = null
    let invoiceData: MatchInput | null = null

    // Parse each input
    if (po?.type === 'documentId') {
      poData = await parseInput(po.value)
    }
    if (grn?.type === 'documentId') {
      grnData = await parseInput(grn.value)
    }
    if (invoice?.type === 'documentId') {
      invoiceData = await parseInput(invoice.value)
    }

    // Process uploaded files from formData if present
    // (For file uploads, we use a separate multipart endpoint)
    // For now, support document IDs

    // Validate we have at least 2 documents
    const docsProvided = [poData, grnData, invoiceData].filter(Boolean).length
    if (docsProvided < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 documents for matching. Upload or select PO, GRN, and/or Invoice.' },
        { status: 400 }
      )
    }

    // Run the matching engine
    const result = await performThreeWayMatch(poData, grnData, invoiceData)

    // Save match result to database
    const match = await db.threeWayMatch.create({
      data: {
        poId: poData?.documentId || null,
        grnId: grnData?.documentId || null,
        invoiceId: invoiceData?.documentId || null,
        matchStatus: result.matchStatus,
        discrepancies: JSON.stringify(result.discrepancies),
        confidenceScore: result.confidenceScore,
      },
    })

    return NextResponse.json({
      success: true,
      matchId: match.id,
      ...result,
    })
  } catch (error) {
    console.error('Matching error:', error)
    return NextResponse.json(
      { error: 'Matching failed. Please try again.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const matches = await db.threeWayMatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      success: true,
      matches: matches.map((m) => ({
        id: m.id,
        matchStatus: m.matchStatus,
        confidenceScore: m.confidenceScore,
        discrepancies: m.discrepancies ? JSON.parse(m.discrepancies) : [],
        poId: m.poId,
        grnId: m.grnId,
        invoiceId: m.invoiceId,
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    console.error('Fetch matches error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch match history.' },
      { status: 500 }
    )
  }
}