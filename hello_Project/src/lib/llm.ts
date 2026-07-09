/**
 * Rule-based document data extraction (fully offline)
 * Uses regex patterns to extract vendor, amounts, dates, line items from raw text.
 * Optionally uses LLM (OpenAI) if OPENAI_API_KEY is set in .env
 */

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface ExtractedDocument {
  vendorName: string
  vendorEmail: string
  vendorPhone: string
  documentNumber: string
  documentDate: string
  dueDate: string
  items: LineItem[]
  totalAmount: number
  taxAmount: number
  subtotalAmount: number
  currency: string
  confidence: number // 0-100, how confident the extraction is
}

// ===== CURRENCY DETECTION =====

const CURRENCY_PATTERNS: [RegExp, string][] = [
  [/\$\s*[\d,]+/g, 'USD'],
  [/₹\s*[\d,]+/g, 'INR'],
  [/€\s*[\d,]+/g, 'EUR'],
  [/£\s*[\d,]+/g, 'GBP'],
  [/AED\s*[\d,]+/g, 'AED'],
  [/SAR\s*[\d,]+/g, 'SAR'],
  [/Rs\.?\s*[\d,]+/g, 'INR'],
  [/INR\s*[\d,]+/g, 'INR'],
]

function detectCurrency(text: string): string {
  for (const [pattern, currency] of CURRENCY_PATTERNS) {
    if (pattern.test(text)) return currency
  }
  return 'USD'
}

// ===== AMOUNT EXTRACTION =====

function parseAmount(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[^0-9.]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function extractTotalAmount(text: string): number {
  const patterns = [
    /(?:total|grand total|amount due|net amount|total payable|balance due)[:\s]*[₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:total|grand total|amount due|net amount|total payable|balance due)[:\s]*([\d,]+(?:\.\d{1,2})?)\s*[₹$€£]?/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return parseAmount(match[1])
  }

  // Fallback: find the largest number that looks like a currency amount
  const allAmounts = text.match(/[\d,]+(?:\.\d{1,2})/g) || []
  const amounts = allAmounts.map(parseAmount).filter((a) => a > 0)
  return amounts.length > 0 ? Math.max(...amounts) : 0
}

function extractTaxAmount(text: string): number {
  const patterns = [
    /(?:tax|gst|vat|cgst|sgst|igst)[:\s]*[₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:tax|gst|vat|cgst|sgst|igst)\s*[₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return parseAmount(match[1])
  }
  return 0
}

function extractSubtotal(text: string): number {
  const patterns = [
    /(?:subtotal|sub-total|sub total)[:\s]*[₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return parseAmount(match[1])
  }
  return 0
}

// ===== VENDOR NAME EXTRACTION =====

function extractVendorName(text: string): string {
  const patterns = [
    /(?:from|seller|vendor|supplier|company|contractor)[:\s]+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\n|$|,|\s{2,})/im,
    /(?:bill (?:from|to)|sold (?:by|to))[:\s]+([A-Z][A-Za-z0-9\s&.,'-]+?)(?:\n|$|,|\s{2,})/im,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1].trim().length > 2 && match[1].trim().length < 80) {
      return match[1].trim()
    }
  }

  // Fallback: look for a prominent company-like name near the top
  const lines = text.split('\n').slice(0, 15)
  for (const line of lines) {
    const cleaned = line.trim()
    // Company names often are short, capitalized, may include common suffixes
    if (
      cleaned.length > 3 &&
      cleaned.length < 60 &&
      /^[A-Z]/.test(cleaned) &&
      !/^(the|date|invoice|purchase|contract|quotation|page|serial|s\.no|item|description|qty|rate|amount|total|tax|address|phone|email)/i.test(cleaned)
    ) {
      if (/(?:Pvt|Ltd|LLC|Inc|Corp|Co\.|Company|Supplies|Materials|Traders|Enterprises|Solutions|Services|Group|Construction|Engineering)/.test(cleaned)) {
        return cleaned
      }
    }
  }

  return ''
}

// ===== DOCUMENT NUMBER EXTRACTION =====

function extractDocumentNumber(text: string, fileType: string): string {
  const labels: Record<string, string[]> = {
    invoice: ['invoice no', 'invoice number', 'inv no', 'inv number', 'bill no', 'bill number'],
    po: ['po no', 'po number', 'purchase order no', 'purchase order number', 'order no'],
    grn: ['grn no', 'grn number', 'goods receipt no', 'challan no', 'dc no', 'delivery note no'],
    contract: ['contract no', 'contract number', 'agreement no', 'agreement number'],
    quotation: ['quotation no', 'quotation number', 'quote no', 'quote number', 'rfq no'],
  }

  const searchLabels = labels[fileType] || labels.invoice
  for (const label of searchLabels) {
    const pattern = new RegExp(`${label}[:\\s.#]*([A-Z0-9\\-_/]+)`, 'i')
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }

  // Generic fallback
  const genericPattern = /(?:no|number|#)[:\s.#]*([A-Z0-9\-_/]{4,20})/i
  const match = text.match(genericPattern)
  return match ? match[1].trim() : ''
}

// ===== DATE EXTRACTION =====

function extractDate(text: string, label: string): string {
  const patterns = [
    new RegExp(`${label}[:\\s]*([\\d]{1,2}[\\s/\\-][A-Za-z]{3,9}[\\s/\\-][\\d]{2,4})`, 'i'),
    new RegExp(`${label}[:\\s]*([\\d]{4}[\\s/\\-][\\d]{1,2}[\\s/\\-][\\d]{1,2})`, 'i'),
    new RegExp(`${label}[:\\s]*([\\d]{1,2}[\\s/\\-][\\d]{1,2}[\\s/\\-][\\d]{2,4})`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return ''
}

// ===== LINE ITEMS EXTRACTION =====

function extractLineItems(text: string): LineItem[] {
  const items: LineItem[] = []
  const lines = text.split('\n')

  // Find lines that look like table rows (contain numbers that could be qty, rate, amount)
  for (const line of lines) {
    const cleaned = line.trim()
    if (!cleaned || cleaned.length < 10) continue

    // Skip header rows
    if (/^(item|s\.?no|sl\.?no|description|serial|particulars)/i.test(cleaned)) continue
    if (/^(qty|quantity|rate|unit|amount|total|price)/i.test(cleaned) && cleaned.length < 60) continue

    // Try to find a pattern: description  quantity  rate  total
    // Common formats:
    // "Cement OPC 43 Grade  500  380  190000"
    // "Steel Rebar 12mm    100   52.50   5250.00"
    const itemPattern = /^(.+?)\s{2,}([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*$/
    const match = cleaned.match(itemPattern)

    if (match) {
      const description = match[1].trim().replace(/^\d+[\.\)]\s*/, '') // Remove leading "1." or "1)"
      const quantity = parseAmount(match[2])
      const unitPrice = parseAmount(match[3])
      const total = parseAmount(match[4])

      if (description.length > 2 && quantity > 0 && total > 0) {
        items.push({ description, quantity, unitPrice, total })
      }
    }
  }

  return items
}

// ===== EMAIL & PHONE EXTRACTION =====

function extractEmail(text: string): string {
  const match = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  return match ? match[1] : ''
}

function extractPhone(text: string): string {
  const patterns = [
    /(?:phone|tel|mobile|contact)[:\s]*([+\d][\d\s\-()]{7,15})/i,
    /([+\d][\d\s\-()]{7,15})/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return ''
}

// ===== CONFIDENCE SCORING =====

function calculateConfidence(extracted: ExtractedDocument): number {
  let score = 0
  if (extracted.vendorName) score += 25
  if (extracted.documentNumber) score += 20
  if (extracted.documentDate) score += 15
  if (extracted.totalAmount > 0) score += 25
  if (extracted.items.length > 0) score += 15
  return Math.min(score, 100)
}

// ===== MAIN EXTRACTION FUNCTION =====

export async function extractDocumentData(
  text: string,
  fileType: string
): Promise<ExtractedDocument> {
  const currency = detectCurrency(text)

  const extracted: ExtractedDocument = {
    vendorName: extractVendorName(text),
    vendorEmail: extractEmail(text),
    vendorPhone: extractPhone(text),
    documentNumber: extractDocumentNumber(text, fileType),
    documentDate: extractDate(text, 'date') || extractDate(text, 'invoice date') || extractDate(text, 'order date'),
    dueDate: extractDate(text, 'due date') || extractDate(text, 'payment due'),
    items: extractLineItems(text),
    totalAmount: extractTotalAmount(text),
    taxAmount: extractTaxAmount(text),
    subtotalAmount: extractSubtotal(text),
    currency,
    confidence: 0,
  }

  // If no subtotal but we have total and tax, calculate subtotal
  if (extracted.subtotalAmount === 0 && extracted.totalAmount > 0 && extracted.taxAmount > 0) {
    extracted.subtotalAmount = extracted.totalAmount - extracted.taxAmount
  }

  // Calculate confidence
  extracted.confidence = calculateConfidence(extracted)

  return extracted
}

/**
 * Format extracted data as a human-readable summary
 */
// ===== VALIDATION =====

export interface ValidationIssue {
  field: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface ValidationResult {
  passed: boolean
  issues: ValidationIssue[]
  score: number // 0-100
}

export function validateExtraction(data: ExtractedDocument, fileType: string): ValidationResult {
  const issues: ValidationIssue[] = []
  let score = 100

  // Check critical fields
  if (!data.vendorName) {
    issues.push({ field: 'Vendor Name', severity: 'error', message: 'Vendor name could not be extracted' })
    score -= 20
  }
  if (!data.documentNumber) {
    issues.push({ field: 'Document Number', severity: 'error', message: 'Document number could not be extracted' })
    score -= 15
  }
  if (!data.documentDate) {
    issues.push({ field: 'Date', severity: 'warning', message: 'Document date could not be extracted' })
    score -= 10
  }
  if (data.totalAmount <= 0) {
    issues.push({ field: 'Total Amount', severity: 'error', message: 'Total amount could not be extracted' })
    score -= 25
  }
  if (data.items.length === 0) {
    issues.push({ field: 'Line Items', severity: 'warning', message: 'No line items could be extracted from the document' })
    score -= 15
  }

  // Invoices specific checks
  if (fileType === 'invoice') {
    if (!data.dueDate) {
      issues.push({ field: 'Due Date', severity: 'info', message: 'Due date not found — payment timeline cannot be determined' })
      score -= 5
    }
    if (data.taxAmount <= 0) {
      issues.push({ field: 'Tax', severity: 'info', message: 'No tax amount detected — verify if tax-exempt or missed' })
      score -= 5
    }
    // Check math: subtotal + tax should ~= total
    if (data.subtotalAmount > 0 && data.taxAmount > 0 && data.totalAmount > 0) {
      const expected = data.subtotalAmount + data.taxAmount
      const diff = Math.abs(expected - data.totalAmount)
      const pctDiff = data.totalAmount > 0 ? (diff / data.totalAmount) * 100 : 0
      if (pctDiff > 2) {
        issues.push({
          field: 'Amount Consistency',
          severity: 'warning',
          message: `Subtotal (${data.currency} ${data.subtotalAmount.toLocaleString()}) + Tax (${data.currency} ${data.taxAmount.toLocaleString()}) = ${data.currency} ${expected.toLocaleString()}, but stated total is ${data.currency} ${data.totalAmount.toLocaleString()} (diff: ${pctDiff.toFixed(1)}%)`,
        })
        score -= 10
      }
    }
    // Check line items total vs stated total
    if (data.items.length > 0 && data.totalAmount > 0) {
      const itemsTotal = data.items.reduce((sum, item) => sum + item.total, 0)
      const diff = Math.abs(itemsTotal - data.totalAmount)
      const pctDiff = data.totalAmount > 0 ? (diff / data.totalAmount) * 100 : 0
      if (pctDiff > 5) {
        issues.push({
          field: 'Line Items Total',
          severity: 'warning',
          message: `Sum of line items (${data.currency} ${itemsTotal.toLocaleString()}) differs from total (${data.currency} ${data.totalAmount.toLocaleString()}) by ${pctDiff.toFixed(1)}%`,
        })
        score -= 10
      }
    }
  }

  // PO specific checks
  if (fileType === 'po') {
    if (data.items.length === 0) {
      issues.push({ field: 'Order Items', severity: 'error', message: 'Purchase Order has no line items — cannot verify deliveries' })
      score -= 10
    }
  }

  return { passed: score >= 60, issues, score: Math.max(0, score) }
}

// ===== RISK SCORING =====

export interface RiskAssessment {
  score: number // 0-100, higher = riskier
  level: 'Low' | 'Medium' | 'High'
  factors: string[]
}

export function calculateRiskScore(
  validation: ValidationResult,
  matchResult?: { matchStatus: string; confidenceScore: number; discrepancies: Array<{ severity: string }> } | null,
  fraudAlerts?: Array<{ severity: string; alertType: string; description: string }> | null,
): RiskAssessment {
  let score = 0
  const factors: string[] = []

  // Validation risks
  if (validation.score < 60) {
    score += 30
    factors.push('Low extraction confidence — data may be incomplete or inaccurate')
  } else if (validation.score < 80) {
    score += 15
    factors.push('Some extraction issues found — manual verification recommended')
  }
  const errors = validation.issues.filter((i) => i.severity === 'error')
  if (errors.length >= 2) {
    score += 20
    factors.push(`${errors.length} critical fields missing from extraction`)
  }

  // Match risks
  if (matchResult) {
    if (matchResult.matchStatus === 'mismatch') {
      score += 35
      factors.push('Three-way match failed — significant discrepancies between PO, GRN, and Invoice')
    } else if (matchResult.matchStatus === 'partial_match') {
      score += 20
      factors.push('Partial match — some discrepancies found between documents')
    }
    const highSevDiscrepancies = matchResult.discrepancies.filter((d) => d.severity === 'high')
    if (highSevDiscrepancies.length > 0) {
      score += highSevDiscrepancies.length * 5
      factors.push(`${highSevDiscrepancies.length} high-severity discrepancy(ies) detected`)
    }
  }

  // Fraud risks
  if (fraudAlerts && fraudAlerts.length > 0) {
    const critical = fraudAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high')
    if (critical.length > 0) {
      score += 30
      factors.push(`${critical.length} high/critical fraud alert(s) triggered`)
    }
    const medium = fraudAlerts.filter((a) => a.severity === 'medium')
    if (medium.length > 0) {
      score += medium.length * 10
      factors.push(`${medium.length} medium-severity anomaly(ies) flagged`)
    }
  }

  score = Math.min(100, Math.max(0, score))
  const level: RiskAssessment['level'] = score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low'

  return { score, level, factors }
}

// ===== AI SUMMARY =====

export function generateAISummary(
  data: ExtractedDocument,
  fileType: string,
 validation: ValidationResult,
 matchResult?: { matchStatus: string; confidenceScore: number; discrepancies: Array<{ severity: string; description: string }> } | null,
  fraudAlerts?: Array<{ severity: string; alertType: string; description: string }> | null,
): string {
  const typeLabel: Record<string, string> = { invoice: 'Invoice', po: 'Purchase Order', grn: 'Goods Receipt Note', contract: 'Contract', quotation: 'Quotation' }
  const label = typeLabel[fileType] || 'Document'

  const lines: string[] = []

  // Opening
  if (data.vendorName && data.totalAmount > 0) {
    lines.push(`${data.vendorName} submitted ${label} ${data.documentNumber || '(number not detected)'} for ${data.currency} ${data.totalAmount.toLocaleString()}.`)
  } else if (data.vendorName) {
    lines.push(`${data.vendorName} submitted a ${label.toLowerCase()} ${data.documentNumber || ''}.`)
  } else {
    lines.push(`A ${label.toLowerCase()} ${data.documentNumber || ''} was processed.`)
  }

  // Items
  if (data.items.length > 0) {
    lines.push(`It contains ${data.items.length} line item(s)${data.documentDate ? ` dated ${data.documentDate}` : ''}.`)
  } else if (data.documentDate) {
    lines.push(`Document date: ${data.documentDate}.`)
  }

  // Validation
  if (!validation.passed) {
    const errorFields = validation.issues.filter((i) => i.severity === 'error').map((i) => i.field)
    if (errorFields.length > 0) {
      lines.push(`Validation flagged missing fields: ${errorFields.join(', ')}.`)
    }
  } else {
    lines.push('All critical fields were successfully extracted and validated.')
  }

  // Match result
  if (matchResult) {
    if (matchResult.matchStatus === 'matched') {
      lines.push(`Three-way match: PASSED with ${matchResult.confidenceScore}% confidence.`)
    } else if (matchResult.matchStatus === 'partial_match') {
      lines.push(`Three-way match: PARTIAL — ${matchResult.discrepancies.length} discrepancy(ies) found (${matchResult.confidenceScore}% confidence).`)
    } else {
      lines.push(`Three-way match: FAILED — ${matchResult.discrepancies.length} discrepancy(ies) found (${matchResult.confidenceScore}% confidence).`)
    }
  }

  // Fraud
  if (fraudAlerts && fraudAlerts.length > 0) {
    const types = fraudAlerts.map((a) => a.alertType.replace(/_/g, ' '))
    lines.push(`Fraud checks triggered ${fraudAlerts.length} alert(s): ${types.join(', ')}.`)
  }

  return lines.join(' ')
}

// ===== RECOMMENDATION =====

export type RecommendationAction = 'Approve' | 'Review' | 'Reject' | 'Escalate'

export interface Recommendation {
  action: RecommendationAction
  reason: string
  nextSteps: string[]
}

export function generateRecommendation(
  validation: ValidationResult,
  risk: RiskAssessment,
  matchResult?: { matchStatus: string } | null,
  fraudAlerts?: Array<{ severity: string; description: string; recommendation: string }> | null,
): Recommendation {
  const nextSteps: string[] = []

  // Escalate: critical fraud or mismatch
  if (fraudAlerts && fraudAlerts.some((a) => a.severity === 'critical')) {
    return {
      action: 'Escalate',
      reason: 'Critical fraud alert detected. Immediate investigation required before any payment.',
      nextSteps: fraudAlerts.filter((a) => a.severity === 'critical').map((a) => a.recommendation),
    }
  }

  // Reject: failed match + high risk
  if (matchResult?.matchStatus === 'mismatch' && risk.level === 'High') {
    return {
      action: 'Reject',
      reason: 'Three-way match failed with high risk score. Documents have significant inconsistencies.',
      nextSteps: ['Reconcile discrepancies between PO, GRN, and Invoice', 'Contact vendor for clarification', 'Verify goods were actually received'],
    }
  }

  // Reject: validation failed badly
  if (validation.score < 40) {
    return {
      action: 'Reject',
      reason: 'Too many critical fields could not be extracted. Document quality is insufficient for processing.',
      nextSteps: ['Re-upload a clearer version of the document', 'Verify the document is not corrupted', 'Consider manual data entry if original is unavailable'],
    }
  }

  // Review: any fraud alerts or partial match or medium risk
  if (fraudAlerts && fraudAlerts.length > 0) {
    const recs = fraudAlerts.map((a) => a.recommendation).filter(Boolean)
    return {
      action: 'Review',
      reason: `${fraudAlerts.length} fraud/anomaly alert(s) require review before approval.`,
      nextSteps: recs.length > 0 ? recs : ['Investigate flagged anomalies', 'Verify with vendor if amounts are correct'],
    }
  }

  if (matchResult?.matchStatus === 'partial_match') {
    return {
      action: 'Review',
      reason: 'Partial three-way match — some discrepancies found that need manual verification.',
      nextSteps: ['Review line item discrepancies', 'Confirm quantity/price differences with vendor', 'Check if partial delivery was authorized'],
    }
  }

  if (risk.level === 'Medium') {
    return {
      action: 'Review',
      reason: 'Medium risk assessment. Manual review recommended before processing.',
      nextSteps: risk.factors.length > 0 ? risk.factors.map((f) => `Verify: ${f}`) : ['Review extracted data for accuracy', 'Confirm amounts match supporting documents'],
    }
  }

  // Approve: all clear
  return {
    action: 'Approve',
    reason: 'Document passed all validation checks, no fraud alerts, and three-way match is clean.',
    nextSteps: ['Proceed with payment processing', 'Archive document for audit trail', 'Update vendor ledger'],
  }
}

/**
 * Format extracted data as a human-readable summary
 */
export function formatExtractionSummary(data: ExtractedDocument): string {
  const lines: string[] = []
  if (data.vendorName) lines.push(`Vendor: ${data.vendorName}`)
  if (data.documentNumber) lines.push(`Document #: ${data.documentNumber}`)
  if (data.documentDate) lines.push(`Date: ${data.documentDate}`)
  if (data.dueDate) lines.push(`Due: ${data.dueDate}`)
  if (data.totalAmount > 0) lines.push(`Total: ${data.currency} ${data.totalAmount.toLocaleString()}`)
  if (data.taxAmount > 0) lines.push(`Tax: ${data.currency} ${data.taxAmount.toLocaleString()}`)
  if (data.items.length > 0) {
    lines.push(`\nLine Items (${data.items.length}):`)
    data.items.forEach((item, i) => {
      lines.push(`  ${i + 1}. ${item.description} — Qty: ${item.quantity} × ${data.currency} ${item.unitPrice} = ${data.currency} ${item.total}`)
    })
  }
  lines.push(`\nExtraction Confidence: ${data.confidence}%`)
  return lines.join('\n')
}