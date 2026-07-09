import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractTextFromFile, classifyDocument, formatFileSize } from '@/lib/ocr'
import {
  extractDocumentData,
  formatExtractionSummary,
  validateExtraction,
  calculateRiskScore,
  generateAISummary,
  generateRecommendation,
  ExtractedDocument,
} from '@/lib/llm'
import { performThreeWayMatch, MatchInput } from '@/lib/matching-engine'
import { runFraudDetection } from '@/lib/fraud-detector'

// ===== HELPERS =====

function parseExtractedData(doc: { extractedData: string | null }): ExtractedDocument | null {
  if (!doc.extractedData) return null
  try {
    return JSON.parse(doc.extractedData) as ExtractedDocument
  } catch {
    return null
  }
}

/** Find linked documents by PO reference, contract reference, or vendor name */
async function findLinkedDocuments(extracted: ExtractedDocument, currentDocId: string) {
  const linked: { po: MatchInput | null; grn: MatchInput | null; invoice: MatchInput | null; contract: any } = { po: null, grn: null, invoice: null, contract: null }

  // Extract PO reference and contract reference from the text
  const allDocs = await db.document.findMany({
    where: { id: { not: currentDocId }, extractedText: { not: null } },
  })

  for (const doc of allDocs) {
    const data = parseExtractedData(doc)
    if (!data) continue

    const isSameVendor = extracted.vendorName && data.vendorName &&
      extracted.vendorName.toLowerCase() === data.vendorName.toLowerCase()

    // Check PO reference match
    if (data.documentNumber && extracted.documentNumber && data.documentNumber === extracted.documentNumber) continue

    // Check if this doc references the same PO number
    const currentText = doc.extractedData || ''
    const hasPORef = currentText.includes('PO-') || currentText.includes('po-') || currentText.includes('PO ')

    if (doc.fileType === 'po' && isSameVendor) {
      linked.po = {
        type: 'po',
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
    if (doc.fileType === 'grn' && isSameVendor) {
      linked.grn = {
        type: 'grn',
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
    if (doc.fileType === 'invoice' && isSameVendor) {
      linked.invoice = {
        type: 'invoice',
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
    if (doc.fileType === 'contract' && isSameVendor) {
      linked.contract = { id: doc.id, filename: doc.filename, documentNumber: data.documentNumber }
    }
  }

  return linked
}

// ===== MULTI-FILE UPLOAD =====

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    // Support both 'files' (multi) and 'file' (single) for backwards compat
    const singleFile = formData.get('file') as File | null
    const filesToProcess = files.length > 0 ? files : singleFile ? [singleFile] : []

    if (filesToProcess.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }

    const results = []

    for (const file of filesToProcess) {
      try {
        // Validate file size
        if (file.size > 20 * 1024 * 1024) {
          results.push({ filename: file.name, success: false, error: 'File too large (max 20MB)' })
          continue
        }

        // Validate file type
        const ext = file.name.split('.').pop()?.toLowerCase()
        const allowedExts = ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'txt', 'csv']
        if (!allowedExts.includes(ext || '')) {
          results.push({ filename: file.name, success: false, error: 'Unsupported file type' })
          continue
        }

        // Step 1: OCR
        const extractedText = await extractTextFromFile(file)
        if (!extractedText.trim()) {
          results.push({ filename: file.name, success: false, error: 'Could not extract text — file may be empty or unreadable' })
          continue
        }

        // Step 2: Classify
        const fileType = classifyDocument(file.name, extractedText)

        // Step 3: Extract
        const extractedData = await extractDocumentData(extractedText, fileType)

        // Step 4: Validate
        const validation = validateExtraction(extractedData, fileType)

        // Step 5: Save to DB
        const document = await db.document.create({
          data: {
            filename: file.name,
            fileType,
            extractedText,
            status: validation.passed ? 'processed' : 'flagged',
            amount: extractedData.totalAmount,
            currency: extractedData.currency,
            documentDate: extractedData.documentDate,
            riskScore: 0, // will update after analysis
            extractedData: JSON.stringify(extractedData),
          },
        })

        // Step 6: Auto-link + Auto-match
        let matchResult = null
        const linked = await findLinkedDocuments(extractedData, document.id)

        if (linked.po || linked.invoice || linked.grn) {
          try {
            matchResult = await performThreeWayMatch(linked.po, linked.grn, linked.invoice)
            // Save match to DB
            await db.threeWayMatch.create({
              data: {
                documentId: document.id,
                matchStatus: matchResult.matchStatus,
                discrepancies: JSON.stringify(matchResult.discrepancies),
                confidenceScore: matchResult.confidenceScore,
              },
            })
          } catch (e) {
            console.error('Auto-match error:', e)
          }
        }

        // Step 7: Auto-fraud detection
        let fraudAlerts: Array<{ severity: string; alertType: string; description: string; recommendation: string }> = []
        try {
          const alerts = await runFraudDetection()
          // Filter alerts for this document
          fraudAlerts = alerts
            .filter((a) => a.documentId === document.id)
            .map((a) => ({
              severity: a.severity,
              alertType: a.alertType,
              description: a.description,
              recommendation: a.recommendation,
            }))
        } catch (e) {
          console.error('Auto-fraud error:', e)
        }

        // Step 8: Risk Score
        const risk = calculateRiskScore(
          validation,
          matchResult ? { matchStatus: matchResult.matchStatus, confidenceScore: matchResult.confidenceScore, discrepancies: matchResult.discrepancies } : null,
          fraudAlerts.length > 0 ? fraudAlerts : null,
        )

        // Update document with risk score
        await db.document.update({
          where: { id: document.id },
          data: { riskScore: risk.score },
        })

        // Step 9: AI Summary & Recommendation
        const aiSummary = generateAISummary(
          extractedData,
          fileType,
          validation,
          matchResult ? { matchStatus: matchResult.matchStatus, confidenceScore: matchResult.confidenceScore, discrepancies: matchResult.discrepancies } : null,
          fraudAlerts.length > 0 ? fraudAlerts : null,
        )

        const recommendation = generateRecommendation(
          validation,
          risk,
          matchResult ? { matchStatus: matchResult.matchStatus } : null,
          fraudAlerts.length > 0 ? fraudAlerts : null,
        )

        // Build linked documents info
        const linkedDocs: string[] = []
        if (linked.po) linkedDocs.push(`PO: ${linked.po.documentNumber || linked.po.filename}`)
        if (linked.grn) linkedDocs.push(`GRN: ${linked.grn.documentNumber || linked.grn.filename}`)
        if (linked.invoice) linkedDocs.push(`Invoice: ${linked.invoice.documentNumber || linked.invoice.filename}`)
        if (linked.contract) linkedDocs.push(`Contract: ${linked.contract.documentNumber || linked.contract.filename}`)

        results.push({
          success: true,
          filename: file.name,
          document: {
            id: document.id,
            filename: document.filename,
            fileType: document.fileType,
            status: document.status,
            amount: document.amount,
            currency: document.currency,
            documentDate: document.documentDate,
            extractedTextLength: extractedText.length,
            extractionConfidence: extractedData.confidence,
            extractedData: {
              vendorName: extractedData.vendorName,
              vendorEmail: extractedData.vendorEmail,
              vendorPhone: extractedData.vendorPhone,
              documentNumber: extractedData.documentNumber,
              documentDate: extractedData.documentDate,
              dueDate: extractedData.dueDate,
              totalAmount: extractedData.totalAmount,
              taxAmount: extractedData.taxAmount,
              subtotalAmount: extractedData.subtotalAmount,
              currency: extractedData.currency,
              items: extractedData.items,
            },
            fileSize: formatFileSize(file.size),
            createdAt: document.createdAt,
          },
          analysis: {
            validation: {
              passed: validation.passed,
              score: validation.score,
              issues: validation.issues,
            },
            risk: {
              score: risk.score,
              level: risk.level,
              factors: risk.factors,
            },
            match: matchResult ? {
              status: matchResult.matchStatus,
              confidence: matchResult.confidenceScore,
              discrepancies: matchResult.discrepancies.length,
            } : null,
            fraudAlerts: fraudAlerts.length > 0 ? fraudAlerts : null,
            linkedDocuments: linkedDocs.length > 0 ? linkedDocs : null,
            aiSummary,
            recommendation: {
              action: recommendation.action,
              reason: recommendation.reason,
              nextSteps: recommendation.nextSteps,
            },
          },
        })
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        results.push({ filename: file.name, success: false, error: 'Processing failed' })
      }
    }

    const allSuccess = results.every((r) => r.success)
    const successCount = results.filter((r) => r.success).length

    return NextResponse.json({
      success: allSuccess,
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: results.length - successCount,
      },
    })
  } catch (error) {
    console.error('Document upload error:', error)
    return NextResponse.json(
      { error: 'Failed to process documents. Please try again.' },
      { status: 500 },
    )
  }
}

// ===== DELETE ALL DOCUMENTS =====

export async function DELETE() {
  try {
    // Delete related records first (foreign keys)
    await db.threeWayMatch.deleteMany({})
    await db.fraudAlert.deleteMany({})
    await db.chatMessage.deleteMany({})
    await db.document.deleteMany({})

    return NextResponse.json({ success: true, message: 'All documents cleared' })
  } catch (error) {
    console.error('Clear documents error:', error)
    return NextResponse.json({ error: 'Failed to clear documents.' }, { status: 500 })
  }
}

// ===== GET ALL DOCUMENTS =====

export async function GET() {
  try {
    const documents = await db.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      success: true,
      documents: documents.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        fileType: doc.fileType,
        status: doc.status,
        amount: doc.amount,
        currency: doc.currency,
        riskScore: doc.riskScore,
        documentDate: doc.documentDate,
        createdAt: doc.createdAt,
        extractedTextLength: doc.extractedText?.length || 0,
        extractedData: doc.extractedData ? JSON.parse(doc.extractedData) : null,
      })),
    })
  } catch (error) {
    console.error('Document fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch documents.' },
      { status: 500 },
    )
  }
}