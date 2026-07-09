/**
 * Three-Way Matching Engine — Fully Offline
 *
 * Compares Purchase Order ↔ Goods Receipt Note ↔ Invoice
 * Detects discrepancies in quantities, prices, line items, and totals.
 */

// ===== TYPES =====

export interface LineItemInput {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface MatchInput {
  type: 'po' | 'grn' | 'invoice'
  documentId?: string
  filename?: string
  vendorName: string
  items: LineItemInput[]
  totalAmount: number
  taxAmount: number
  documentNumber?: string
  documentDate?: string
  rawText?: string
}

export interface Discrepancy {
  field: string
  description: string
  poValue: string
  grnValue: string
  invoiceValue: string
  severity: 'low' | 'medium' | 'high'
}

export interface MatchResult {
  matchStatus: 'matched' | 'partial_match' | 'mismatch'
  confidenceScore: number
  discrepancies: Discrepancy[]
  lineItemComparison: LineItemMatch[]
  summary: string
  poData: MatchInput | null
  grnData: MatchInput | null
  invoiceData: MatchInput | null
}

export interface LineItemMatch {
  description: string
  poQty: number | null
  grnQty: number | null
  invoiceQty: number | null
  poPrice: number | null
  grnPrice: number | null
  invoicePrice: number | null
  poTotal: number | null
  grnTotal: number | null
  invoiceTotal: number | null
  status: 'matched' | 'partial' | 'mismatch' | 'missing'
  issues: string[]
}

// ===== LINE ITEM MATCHING =====

/**
 * Fuzzy match line items across documents using description similarity
 */
function descriptionSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim()
  const bLower = b.toLowerCase().trim()

  if (aLower === bLower) return 1.0

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.85

  // Word overlap similarity
  const wordsA = new Set(aLower.split(/\s+/).filter((w) => w.length > 2))
  const wordsB = new Set(bLower.split(/\s+/).filter((w) => w.length > 2))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Match line items across PO, GRN, and Invoice
 */
function matchLineItems(po: MatchInput | null, grn: MatchInput | null, invoice: MatchInput | null): LineItemMatch[] {
  const poItems = po?.items || []
  const grnItems = grn?.items || []
  const invoiceItems = invoice?.items || []

  // Use PO as the baseline if available, otherwise use invoice
  const baseline = poItems.length > 0 ? poItems : invoiceItems
  const matches: LineItemMatch[] = []
  const usedGrn = new Set<number>()
  const usedInv = new Set<number>()

  for (const baseItem of baseline) {
    let bestGrnIdx = -1
    let bestGrnScore = 0.4 // minimum threshold

    let bestInvIdx = -1
    let bestInvScore = 0.4

    // Find best matching GRN item
    for (let i = 0; i < grnItems.length; i++) {
      if (usedGrn.has(i)) continue
      const score = descriptionSimilarity(baseItem.description, grnItems[i].description)
      if (score > bestGrnScore) {
        bestGrnScore = score
        bestGrnIdx = i
      }
    }

    // Find best matching Invoice item
    for (let i = 0; i < invoiceItems.length; i++) {
      if (usedInv.has(i)) continue
      const score = descriptionSimilarity(baseItem.description, invoiceItems[i].description)
      if (score > bestInvScore) {
        bestInvScore = score
        bestInvIdx = i
      }
    }

    const grnItem = bestGrnIdx >= 0 ? grnItems[bestGrnIdx] : null
    const invItem = bestInvIdx >= 0 ? invoiceItems[bestInvIdx] : null

    if (bestGrnIdx >= 0) usedGrn.add(bestGrnIdx)
    if (bestInvIdx >= 0) usedInv.add(bestInvIdx)

    const poQty = poItems.length > 0 ? baseItem.quantity : null
    const grnQty = grnItem?.quantity ?? null
    const invQty = invItem?.quantity ?? null
    const poPrice = poItems.length > 0 ? baseItem.unitPrice : null
    const grnPrice = grnItem?.unitPrice ?? null
    const invPrice = invItem?.unitPrice ?? null
    const poTotal = poItems.length > 0 ? baseItem.total : null
    const grnTotal = grnItem?.total ?? null
    const invTotal = invItem?.total ?? null

    const issues: string[] = []

    // Check quantity discrepancies
    const quantities = [poQty, grnQty, invQty].filter((q): q is number => q !== null)
    if (quantities.length >= 2) {
      const minQ = Math.min(...quantities)
      const maxQ = Math.max(...quantities)
      if (maxQ > 0 && (maxQ - minQ) / maxQ > 0.05) {
        issues.push(`Quantity mismatch: PO=${poQty ?? 'N/A'}, GRN=${grnQty ?? 'N/A'}, Invoice=${invQty ?? 'N/A'}`)
      }
    }

    // Check price discrepancies
    const prices = [poPrice, invPrice].filter((p): p is number => p !== null)
    if (prices.length >= 2) {
      const minP = Math.min(...prices)
      const maxP = Math.max(...prices)
      if (maxP > 0 && (maxP - minP) / maxP > 0.05) {
        issues.push(`Price mismatch: PO=${poPrice ?? 'N/A'}, Invoice=${invPrice ?? 'N/A'}`)
      }
    }

    // Check total discrepancies
    const totals = [poTotal, grnTotal, invTotal].filter((t): t is number => t !== null)
    if (totals.length >= 2) {
      const minT = Math.min(...totals)
      const maxT = Math.max(...totals)
      if (maxT > 0 && (maxT - minT) / maxT > 0.05) {
        issues.push(`Total mismatch: PO=${poTotal ?? 'N/A'}, GRN=${grnTotal ?? 'N/A'}, Invoice=${invTotal ?? 'N/A'}`)
      }
    }

    let status: LineItemMatch['status'] = 'matched'
    if (issues.length === 0 && (grnQty === null || invQty === null)) {
      status = 'partial'
      if (grnQty === null) issues.push('No matching GRN line item found')
      if (invQty === null) issues.push('No matching Invoice line item found')
    } else if (issues.length > 0) {
      status = issues.some((i) => i.includes('Price')) ? 'mismatch' : 'partial'
    }

    matches.push({
      description: baseItem.description,
      poQty, grnQty, invQty,
      poPrice, grnPrice, invPrice,
      poTotal, grnTotal, invTotal,
      status,
      issues,
    })
  }

  // Add unmatched GRN items
  for (let i = 0; i < grnItems.length; i++) {
    if (!usedGrn.has(i)) {
      matches.push({
        description: grnItems[i].description,
        poQty: null, grnQty: grnItems[i].quantity, invQty: null,
        poPrice: null, grnPrice: grnItems[i].unitPrice, invPrice: null,
        poTotal: null, grnTotal: grnItems[i].total, invTotal: null,
        status: 'missing',
        issues: ['Item in GRN but not found in PO or Invoice'],
      })
    }
  }

  // Add unmatched Invoice items
  for (let i = 0; i < invoiceItems.length; i++) {
    if (!usedInv.has(i)) {
      matches.push({
        description: invoiceItems[i].description,
        poQty: null, grnQty: null, invQty: invoiceItems[i].quantity,
        poPrice: null, grnPrice: null, invPrice: invoiceItems[i].unitPrice,
        poTotal: null, grnTotal: null, invTotal: invoiceItems[i].total,
        status: 'missing',
        issues: ['Item in Invoice but not found in PO or GRN'],
      })
    }
  }

  return matches
}

// ===== MAIN MATCHING FUNCTION =====

export async function performThreeWayMatch(
  po: MatchInput | null,
  grn: MatchInput | null,
  invoice: MatchInput | null
): Promise<MatchResult> {
  const discrepancies: Discrepancy[] = []
  let totalScore = 100

  // 1. Vendor name check
  const vendors = [po?.vendorName, grn?.vendorName, invoice?.vendorName].filter(Boolean) as string[]
  if (vendors.length >= 2) {
    const uniqueVendors = new Set(vendors.map((v) => v.toLowerCase()))
    if (uniqueVendors.size > 1) {
      discrepancies.push({
        field: 'Vendor Name',
        description: 'Vendor names differ across documents',
        poValue: po?.vendorName || 'N/A',
        grnValue: grn?.vendorName || 'N/A',
        invoiceValue: invoice?.vendorName || 'N/A',
        severity: 'high',
      })
      totalScore -= 20
    }
  }

  // 2. Total amount check
  const totals = { po: po?.totalAmount || 0, grn: grn?.totalAmount || 0, invoice: invoice?.totalAmount || 0 }
  if (totals.invoice > 0 && totals.po > 0) {
    const diff = Math.abs(totals.invoice - totals.po)
    const pctDiff = totals.po > 0 ? (diff / totals.po) * 100 : 0

    if (pctDiff > 10) {
      discrepancies.push({
        field: 'Total Amount',
        description: `Invoice total differs from PO by ${pctDiff.toFixed(1)}% (difference: ${diff.toFixed(2)})`,
        poValue: totals.po.toString(),
        grnValue: totals.grn.toString() || 'N/A',
        invoiceValue: totals.invoice.toString(),
        severity: 'high',
      })
      totalScore -= 25
    } else if (pctDiff > 2) {
      discrepancies.push({
        field: 'Total Amount',
        description: `Minor difference of ${pctDiff.toFixed(1)}% between Invoice and PO`,
        poValue: totals.po.toString(),
        grnValue: totals.grn.toString() || 'N/A',
        invoiceValue: totals.invoice.toString(),
        severity: 'medium',
      })
      totalScore -= 10
    }
  }

  // 3. Tax amount check
  if (po?.taxAmount && invoice?.taxAmount) {
    if (Math.abs(po.taxAmount - invoice.taxAmount) > 1) {
      discrepancies.push({
        field: 'Tax Amount',
        description: `Tax differs: PO has ${po.taxAmount}, Invoice has ${invoice.taxAmount}`,
        poValue: po.taxAmount.toString(),
        grnValue: 'N/A',
        invoiceValue: invoice.taxAmount.toString(),
        severity: 'medium',
      })
      totalScore -= 10
    }
  }

  // 4. Line item comparison
  const lineItemComparison = matchLineItems(po, grn, invoice)

  const mismatchedItems = lineItemComparison.filter((i) => i.status === 'mismatch')
  const partialItems = lineItemComparison.filter((i) => i.status === 'partial')
  const missingItems = lineItemComparison.filter((i) => i.status === 'missing')

  if (mismatchedItems.length > 0) {
    totalScore -= mismatchedItems.length * 15
    for (const item of mismatchedItems) {
      discrepancies.push({
        field: 'Line Item',
        description: `"${item.description}": ${item.issues[0]}`,
        poValue: item.poTotal?.toString() || 'N/A',
        grnValue: item.grnTotal?.toString() || 'N/A',
        invoiceValue: item.invoiceTotal?.toString() || 'N/A',
        severity: 'high',
      })
    }
  }

  if (partialItems.length > 0) {
    totalScore -= partialItems.length * 5
  }

  if (missingItems.length > 0) {
    totalScore -= missingItems.length * 10
    for (const item of missingItems) {
      discrepancies.push({
        field: 'Missing Item',
        description: `"${item.description}": ${item.issues[0]}`,
        poValue: item.poTotal?.toString() || 'N/A',
        grnValue: item.grnTotal?.toString() || 'N/A',
        invoiceValue: item.invoiceTotal?.toString() || 'N/A',
        severity: 'medium',
      })
    }
  }

  // Clamp score
  totalScore = Math.max(0, Math.min(100, totalScore))

  // Determine overall status
  let matchStatus: MatchResult['matchStatus'] = 'matched'
  if (totalScore < 60) matchStatus = 'mismatch'
  else if (totalScore < 90) matchStatus = 'partial_match'

  // Generate summary
  const summaryLines: string[] = []
  summaryLines.push(`Three-Way Match: ${matchStatus.toUpperCase().replace('_', ' ')} (${totalScore}% confidence)`)
  summaryLines.push(`Line items: ${lineItemComparison.length} total, ${lineItemComparison.filter((i) => i.status === 'matched').length} matched, ${mismatchedItems.length} mismatched, ${missingItems.length} missing`)
  if (discrepancies.length > 0) {
    summaryLines.push(`Discrepancies found: ${discrepancies.length}`)
  } else {
    summaryLines.push('All checks passed. Documents are consistent.')
  }

  return {
    matchStatus,
    confidenceScore: totalScore,
    discrepancies,
    lineItemComparison,
    summary: summaryLines.join('\n'),
    poData: po,
    grnData: grn,
    invoiceData: invoice,
  }
}