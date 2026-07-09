/**
 * Fraud & Anomaly Detection Engine — Fully Offline
 *
 * Rule-based checks for:
 * 1. Duplicate invoices (same amount + vendor + close dates)
 * 2. Price anomalies (amounts way above/below average for same vendor)
 * 3. Round number invoices (suspiciously round amounts like $50,000)
 * 4. Missing vendor documents (invoice without PO)
 * 5. Weekend/holiday invoice dates
 * 6. Abnormal line item quantities
 */

import { db } from '@/lib/db'

// ===== TYPES =====

export interface FraudCheck {
  alertType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  confidence: number
  documentId: string
  vendorId?: string
  vendorName?: string
  filename?: string
  recommendation: string
}

interface DocumentData {
  id: string
  filename: string
  fileType: string
  amount: number
  currency: string
  documentDate: string | null
  vendorId: string | null
  vendorName: string
  documentNumber: string
  extractedData: Record<string, unknown> | null
}

// ===== CHECK 1: DUPLICATE INVOICE DETECTION =====

function detectDuplicateInvoices(documents: DocumentData[]): FraudCheck[] {
  const alerts: FraudCheck[] = []
  const invoices = documents.filter((d) => d.fileType === 'invoice' && d.amount > 0)

  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i]
      const b = invoices[j]

      let similarityScore = 0

      // Same vendor
      if (a.vendorName && b.vendorName && a.vendorName.toLowerCase() === b.vendorName.toLowerCase()) {
        similarityScore += 40
      }

      // Same or very similar amount (within 1%)
      if (a.amount > 0 && b.amount > 0) {
        const diffPct = Math.abs(a.amount - b.amount) / Math.max(a.amount, b.amount)
        if (diffPct < 0.01) similarityScore += 35
        else if (diffPct < 0.05) similarityScore += 20
      }

      // Same document number pattern
      if (a.documentNumber && b.documentNumber && a.documentNumber === b.documentNumber) {
        similarityScore += 25
      }

      // Close dates (within 7 days)
      if (a.documentDate && b.documentDate) {
        const dateA = new Date(a.documentDate).getTime()
        const dateB = new Date(b.documentDate).getTime()
        const daysDiff = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24)
        if (daysDiff < 7) similarityScore += 15
        else if (daysDiff < 30) similarityScore += 5
      }

      if (similarityScore >= 60) {
        const severity: FraudCheck['severity'] = similarityScore >= 85 ? 'critical' : similarityScore >= 70 ? 'high' : 'medium'
        alerts.push({
          alertType: 'duplicate_invoice',
          severity,
          description: `Possible duplicate invoice: "${a.filename}" and "${b.filename}" have ${Math.round(similarityScore)}% similarity. Same vendor "${a.vendorName || 'Unknown'}", amounts ${a.currency} ${a.amount.toLocaleString()} and ${b.currency} ${b.amount.toLocaleString()}.`,
          confidence: similarityScore,
          documentId: a.id,
          vendorName: a.vendorName,
          filename: a.filename,
          recommendation: 'Verify with the vendor that both invoices are legitimate. Check if services/goods were delivered separately.',
        })
      }
    }
  }

  return alerts
}

// ===== CHECK 2: PRICE ANOMALY DETECTION =====

function detectPriceAnomalies(documents: DocumentData[]): FraudCheck[] {
  const alerts: FraudCheck[] = []

  // Group by vendor
  const vendorAmounts = new Map<string, number[]>()
  for (const doc of documents) {
    if (doc.amount > 0 && doc.vendorName) {
      const key = doc.vendorName.toLowerCase()
      if (!vendorAmounts.has(key)) vendorAmounts.set(key, [])
      vendorAmounts.get(key)!.push(doc.amount)
    }
  }

  // Check each document against vendor's average
  for (const doc of documents) {
    if (doc.amount <= 0 || !doc.vendorName) continue

    const key = doc.vendorName.toLowerCase()
    const amounts = vendorAmounts.get(key)
    if (!amounts || amounts.length < 2) continue

    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const stdDev = Math.sqrt(amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / amounts.length)
    const zScore = stdDev > 0 ? (doc.amount - avg) / stdDev : 0

    if (Math.abs(zScore) > 2) {
      const direction = zScore > 0 ? 'above' : 'below'
      const deviationPct = Math.abs((doc.amount - avg) / avg * 100).toFixed(0)
      alerts.push({
        alertType: 'price_anomaly',
        severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
        description: `"${doc.filename}" amount (${doc.currency} ${doc.amount.toLocaleString()}) is ${deviationPct}% ${direction} ${doc.vendorName}'s average of ${doc.currency} ${Math.round(avg).toLocaleString()}. This is ${Math.abs(zScore).toFixed(1)} standard deviations from the mean.`,
        confidence: Math.min(95, 60 + Math.abs(zScore) * 10),
        documentId: doc.id,
        vendorName: doc.vendorName,
        filename: doc.filename,
        recommendation: zScore > 0
          ? 'Verify the price increase is justified by market conditions or scope changes.'
          : 'Check if this is a partial invoice or if the full amount was billed.',
      })
    }
  }

  return alerts
}

// ===== CHECK 3: ROUND NUMBER DETECTION =====

function detectRoundNumbers(documents: DocumentData[]): FraudCheck[] {
  const alerts: FraudCheck[] = []

  for (const doc of documents) {
    if (doc.fileType !== 'invoice' || doc.amount <= 1000) continue

    // Check if amount is a "suspiciously round" number
    const isRound = doc.amount % 10000 === 0 || doc.amount % 5000 === 0 || doc.amount % 1000 === 0
    if (!isRound) continue

    // Check if there are no line items (suggests fabricated invoice)
    const items = (doc.extractedData as Record<string, unknown>)?.items as Array<unknown> | undefined
    const hasItems = items && Array.isArray(items) && items.length > 0

    if (!hasItems && doc.amount >= 5000) {
      alerts.push({
        alertType: 'suspicious_round_amount',
        severity: doc.amount >= 50000 ? 'high' : 'medium',
        description: `"${doc.filename}" has a round amount of ${doc.currency} ${doc.amount.toLocaleString()} with no detailed line items. This pattern is common in fabricated invoices.`,
        confidence: 55,
        documentId: doc.id,
        vendorName: doc.vendorName,
        filename: doc.filename,
        recommendation: 'Request a detailed breakdown of charges from the vendor.',
      })
    }
  }

  return alerts
}

// ===== CHECK 4: MISSING PO (INVOICE WITHOUT PURCHASE ORDER) =====

function detectMissingPO(documents: DocumentData[]): FraudCheck[] {
  const alerts: FraudCheck[] = []

  const poVendors = new Set(
    documents
      .filter((d) => d.fileType === 'po')
      .map((d) => (d.vendorName || '').toLowerCase())
  )

  for (const doc of documents) {
    if (doc.fileType !== 'invoice') continue
    if (!doc.vendorName) continue
    if (poVendors.size === 0) continue // No POs uploaded yet, skip check

    if (!poVendors.has(doc.vendorName.toLowerCase())) {
      alerts.push({
        alertType: 'missing_purchase_order',
        severity: 'medium',
        description: `Invoice "${doc.filename}" from "${doc.vendorName}" for ${doc.currency} ${doc.amount.toLocaleString()} has no corresponding Purchase Order on file.`,
        confidence: 70,
        documentId: doc.id,
        vendorName: doc.vendorName,
        filename: doc.filename,
        recommendation: 'Verify if a PO was created but not uploaded, or if this is an unauthorized purchase.',
      })
    }
  }

  return alerts
}

// ===== CHECK 5: WEEKEND DATE DETECTION =====

function detectWeekendDates(documents: DocumentData[]): FraudCheck[] {
  const alerts: FraudCheck[] = []

  for (const doc of documents) {
    if (!doc.documentDate) continue
    const date = new Date(doc.documentDate)
    const dayOfWeek = date.getDay() // 0=Sunday, 6=Saturday

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      alerts.push({
        alertType: 'weekend_date',
        severity: 'low',
        description: `"${doc.filename}" has a date on a weekend (${date.toLocaleDateString('en-US', { weekday: 'long' })}). Most procurement documents are issued on business days.`,
        confidence: 45,
        documentId: doc.id,
        vendorName: doc.vendorName,
        filename: doc.filename,
        recommendation: 'Verify this date is correct. Weekend dates may indicate backdating or data entry errors.',
      })
    }
  }

  return alerts
}

// ===== CHECK 6: HIGH-RISK VENDOR DETECTION =====

function detectVendorRisks(documents: DocumentData[]): FraudCheck[] {
  const alerts: FraudCheck[] = []

  // Count invoices per vendor
  const vendorInvoiceCount = new Map<string, number>()
  const vendorTotalAmount = new Map<string, number>()

  for (const doc of documents) {
    if (doc.fileType !== 'invoice' || !doc.vendorName) continue
    const key = doc.vendorName.toLowerCase()
    vendorInvoiceCount.set(key, (vendorInvoiceCount.get(key) || 0) + 1)
    vendorTotalAmount.set(key, (vendorTotalAmount.get(key) || 0) + doc.amount)
  }

  // Check for vendors with only one invoice but high amount
  for (const [vendor, count] of vendorInvoiceCount) {
    if (count === 1) {
      const total = vendorTotalAmount.get(vendor) || 0
      if (total >= 25000) {
        const realName = documents.find((d) => d.vendorName?.toLowerCase() === vendor)?.vendorName
        alerts.push({
          alertType: 'new_vendor_high_amount',
          severity: 'medium',
          description: `Vendor "${realName || vendor}" has only 1 invoice on record for a total of ${total.toLocaleString()}. High-value first-time invoices require extra verification.`,
          confidence: 60,
          documentId: documents.find((d) => d.vendorName?.toLowerCase() === vendor)?.id || '',
          vendorName: realName || vendor,
          recommendation: 'Verify vendor credentials, check for other references, and confirm goods/services were actually received.',
        })
      }
    }
  }

  return alerts
}

// ===== MAIN DETECTION FUNCTION =====

export async function runFraudDetection(): Promise<FraudCheck[]> {
  // Fetch all documents with extracted data
  const documents = await db.document.findMany({
    where: { extractedText: { not: null } },
    orderBy: { createdAt: 'desc' },
  })

  const docData: DocumentData[] = documents.map((doc) => {
    let extractedData: Record<string, unknown> | null = null
    try {
      extractedData = doc.extractedData ? JSON.parse(doc.extractedData) : null
    } catch { /* ignore */ }

    return {
      id: doc.id,
      filename: doc.filename,
      fileType: doc.fileType,
      amount: doc.amount,
      currency: doc.currency,
      documentDate: doc.documentDate,
      vendorId: doc.vendorId,
      vendorName: (extractedData as Record<string, string>)?.vendorName || '',
      documentNumber: (extractedData as Record<string, string>)?.documentNumber || '',
      extractedData,
    }
  })

  if (docData.length === 0) return []

  // Run all checks
  const allAlerts: FraudCheck[] = [
    ...detectDuplicateInvoices(docData),
    ...detectPriceAnomalies(docData),
    ...detectRoundNumbers(docData),
    ...detectMissingPO(docData),
    ...detectWeekendDates(docData),
    ...detectVendorRisks(docData),
  ]

  // Sort by severity then confidence
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  allAlerts.sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3)
    if (sevDiff !== 0) return sevDiff
    return b.confidence - a.confidence
  })

  // Save alerts to database
  for (const alert of allAlerts) {
    await db.fraudAlert.create({
      data: {
        documentId: alert.documentId,
        alertType: alert.alertType,
        severity: alert.severity,
        description: alert.description,
        status: 'open',
      },
    })
  }

  return allAlerts
}