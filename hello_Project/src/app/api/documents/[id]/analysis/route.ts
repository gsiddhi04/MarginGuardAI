import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  validateExtraction,
  calculateRiskScore,
  generateAISummary,
  generateRecommendation,
  ExtractedDocument,
} from '@/lib/llm'
import { getDocumentPriceComparison } from '@/lib/price-intelligence'

function parseData(doc: { extractedData: string | null }): ExtractedDocument | null {
  if (!doc.extractedData) return null
  try { return JSON.parse(doc.extractedData) as ExtractedDocument } catch { return null }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const doc = await db.document.findUnique({ where: { id } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const data = parseData(doc)
    if (!data) return NextResponse.json({ error: 'No extraction data' }, { status: 404 })

    // Validation
    const validation = validateExtraction(data, doc.fileType)

    // Fraud alerts for this document
    const fraudAlerts = await db.fraudAlert.findMany({ where: { documentId: id } })
    const fraudData = fraudAlerts.map((a) => ({
      severity: a.severity,
      alertType: a.alertType,
      description: a.description,
    }))

    // Match results for this document
    const matches = await db.threeWayMatch.findMany({ where: { documentId: id } })
    const matchData = matches.length > 0 ? {
      status: matches[0].matchStatus,
      confidence: matches[0].confidenceScore,
      discrepancies: matches[0].discrepancies ? JSON.parse(matches[0].discrepancies) : [],
    } : null

    // Risk
    const risk = calculateRiskScore(validation, matchData, fraudData.length > 0 ? fraudData : null)

    // Price intelligence
    const priceComparison = await getDocumentPriceComparison(id)

    // AI Summary
    const aiSummary = generateAISummary(data, doc.fileType, validation, matchData, fraudData.length > 0 ? fraudData : null)

    // Recommendation
    const recommendation = generateRecommendation(validation, risk, matchData, fraudData.length > 0 ? fraudData : null)

    // Compliance checks
    const compliance = runComplianceChecks(data, doc)

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id, filename: doc.filename, fileType: doc.fileType,
        status: doc.status, amount: doc.amount, currency: doc.currency,
        documentDate: doc.documentDate, createdAt: doc.createdAt,
      },
      analysis: {
        extraction: {
          confidence: data.confidence,
          fields: {
            vendorName: data.vendorName || null,
            documentNumber: data.documentNumber || null,
            documentDate: data.documentDate || null,
            dueDate: data.dueDate || null,
            totalAmount: data.totalAmount || null,
            taxAmount: data.taxAmount || null,
            subtotalAmount: data.subtotalAmount || null,
            currency: data.currency,
            itemCount: data.items.length,
          },
        },
        validation,
        risk,
        match: matchData,
        fraudAlerts: fraudData.length > 0 ? fraudData : null,
        priceComparison: priceComparison.length > 0 ? priceComparison : null,
        compliance,
        aiSummary,
        recommendation,
      },
    })
  } catch (error) {
    console.error('Analysis API error:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}

function runComplianceChecks(data: ExtractedDocument, doc: any) {
  const checks: Array<{ check: string; passed: boolean; message: string; severity: 'error' | 'warning' | 'info' }> = []
  let score = 100

  // 1. Vendor Tax ID present (check in extracted text)
  if (doc.extractedText) {
    const hasTaxId = /tax\s*id|gstin|pan\s*no|tin\s*no/i.test(doc.extractedText)
    if (!hasTaxId) {
      checks.push({ check: 'Vendor Tax ID', passed: false, message: 'No Tax ID / GSTIN found in document', severity: 'warning' })
      score -= 10
    } else {
      checks.push({ check: 'Vendor Tax ID', passed: true, message: 'Tax ID / GSTIN present', severity: 'info' })
    }
  }

  // 2. Due date reasonableness (should be within 90 days of document date)
  if (data.documentDate && data.dueDate) {
    try {
      const docDate = new Date(data.documentDate)
      const dueDate = new Date(data.dueDate)
      const daysDiff = (dueDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff < 0) {
        checks.push({ check: 'Due Date', passed: false, message: `Due date is ${Math.abs(daysDiff).toFixed(0)} days BEFORE document date`, severity: 'error' })
        score -= 20
      } else if (daysDiff > 90) {
        checks.push({ check: 'Due Date', passed: false, message: `Due date is ${daysDiff.toFixed(0)} days after document date (unusually long)`, severity: 'warning' })
        score -= 10
      } else {
        checks.push({ check: 'Due Date', passed: true, message: `Due date is ${daysDiff.toFixed(0)} days after document date`, severity: 'info' })
      }
    } catch { /* skip */ }
  } else if (doc.fileType === 'invoice') {
    checks.push({ check: 'Due Date', passed: false, message: 'No due date found on invoice', severity: 'warning' })
    score -= 10
  }

  // 3. Payment terms presence
  if (doc.extractedText) {
    const hasTerms = /payment terms|due on receipt|net\s*\d+|immediate/i.test(doc.extractedText)
    if (!hasTerms && doc.fileType === 'invoice') {
      checks.push({ check: 'Payment Terms', passed: false, message: 'No payment terms found', severity: 'info' })
      score -= 5
    } else if (hasTerms) {
      checks.push({ check: 'Payment Terms', passed: true, message: 'Payment terms present', severity: 'info' })
    }
  }

  // 4. Document has required fields
  const requiredFields = [
    { field: 'Vendor Name', value: data.vendorName },
    { field: 'Document Number', value: data.documentNumber },
    { field: 'Total Amount', value: data.totalAmount > 0 },
  ]
  for (const rf of requiredFields) {
    if (rf.value) {
      checks.push({ check: rf.field, passed: true, message: `${rf.field} present`, severity: 'info' })
    } else {
      checks.push({ check: rf.field, passed: false, message: `${rf.field} missing`, severity: 'error' })
      score -= 15
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    level: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    checks,
  }
}