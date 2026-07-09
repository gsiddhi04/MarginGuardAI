import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVendorProfiles } from '@/lib/vendor-analytics'
import { analyzePriceIntelligence } from '@/lib/price-intelligence'
import { ExtractedDocument } from '@/lib/llm'

export async function GET() {
  try {
    const [
      totalDocuments,
      invoices,
      matches,
      fraudAlerts,
      recentDocs,
      recentAlerts,
      recentMatches,
    ] = await Promise.all([
      db.document.count(),
      db.document.count({ where: { fileType: 'invoice' } }),
      db.threeWayMatch.count(),
      db.fraudAlert.count({ where: { status: 'open' } }),
      db.document.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      db.fraudAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 3, where: { status: 'open' } }),
      db.threeWayMatch.findMany({ orderBy: { createdAt: 'desc' }, take: 3 }),
    ])

    // Calculate total spend from invoices
    const invoiceAmounts = await db.document.findMany({
      where: { fileType: 'invoice', amount: { gt: 0 } },
      select: { amount: true, currency: true, extractedData: true },
    })
    const totalSpend = invoiceAmounts.reduce((sum, d) => sum + d.amount, 0)
    const currency = invoiceAmounts[0]?.currency || 'USD'

    // Unique vendors
    const allDocs = await db.document.findMany({ select: { extractedData: true } })
    const vendorSet = new Set<string>()
    for (const doc of allDocs) {
      if (doc.extractedData) {
        try {
          const data = JSON.parse(doc.extractedData)
          if (data.vendorName) vendorSet.add(data.vendorName)
        } catch { /* ignore */ }
      }
    }

    // Average OCR confidence
    let avgConfidence = 0
    let confidenceCount = 0
    for (const doc of allDocs) {
      if (doc.extractedData) {
        try {
          const data: ExtractedDocument = JSON.parse(doc.extractedData)
          if (data.confidence > 0) {
            avgConfidence += data.confidence
            confidenceCount++
          }
        } catch { /* ignore */ }
      }
    }
    avgConfidence = confidenceCount > 0 ? Math.round(avgConfidence / confidenceCount) : 0

    // Validation status
    let processedCount = 0
    let flaggedCount = 0
    for (const doc of await db.document.findMany({ select: { status: true } })) {
      if (doc.status === 'processed') processedCount++
      if (doc.status === 'flagged') flaggedCount++
    }

    // Match stats
    const allMatches = await db.threeWayMatch.findMany()
    const matchedCount = allMatches.filter((m) => m.matchStatus === 'matched').length
    const partialCount = allMatches.filter((m) => m.matchStatus === 'partial_match').length
    const mismatchCount = allMatches.filter((m) => m.matchStatus === 'mismatch').length
    const avgMatchConfidence = allMatches.length > 0
      ? Math.round(allMatches.reduce((s, m) => s + m.confidenceScore, 0) / allMatches.length)
      : 0

    // Vendor reliability (from analytics)
    const vendorProfiles = await getVendorProfiles()
    const avgReliability = vendorProfiles.length > 0
      ? Math.round(vendorProfiles.reduce((s, v) => s + v.reliabilityScore, 0) / vendorProfiles.length)
      : 0
    const avgCompliance = vendorProfiles.length > 0
      ? Math.round(vendorProfiles.reduce((s, v) => s + v.complianceScore, 0) / vendorProfiles.length)
      : 0

    // Price intelligence
    let potentialSavings = 0
    let avgPriceChange = 0
    let priceAnalysisCount = 0
    try {
      const priceData = await analyzePriceIntelligence()
      potentialSavings = priceData.potentialSavings
      if (priceData.comparisons.length > 0) {
        avgPriceChange = Math.round(
          priceData.comparisons.reduce((s, c) => s + c.priceChange, 0) / priceData.comparisons.length * 10
        ) / 10
        priceAnalysisCount = priceData.comparisons.length
      }
    } catch { /* price intel not available */ }

    // Recommended action summary
    const recentProcessedDocs = await db.document.findMany({
      where: { status: { in: ['processed', 'flagged'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    let approveCount = 0
    let reviewCount = 0
    let rejectCount = 0
    for (const doc of recentProcessedDocs) {
      const rs = doc.riskScore
      if (rs === null || rs === undefined) { approveCount++; continue }
      if (rs >= 60) rejectCount++
      else if (rs >= 30) reviewCount++
      else approveCount++
    }
    const recommendedAction = rejectCount > 0 ? 'Review Required' :
      reviewCount > 0 ? 'Review' : 'Clear to Approve'

    // Build recent activity
    const activity: Array<{ action: string; time: string; type: string }> = []

    for (const doc of recentDocs) {
      const mins = Math.max(1, Math.floor((Date.now() - doc.createdAt.getTime()) / 60000))
      const timeStr = mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} hr ago`
      activity.push({
        action: `${doc.fileType === 'invoice' ? 'Invoice' : doc.fileType === 'po' ? 'PO' : doc.fileType === 'grn' ? 'GRN' : doc.fileType === 'contract' ? 'Contract' : 'Document'} "${doc.filename}" uploaded`,
        time: timeStr,
        type: 'upload',
      })
    }

    for (const alert of recentAlerts) {
      const mins = Math.max(1, Math.floor((Date.now() - alert.createdAt.getTime()) / 60000))
      const timeStr = mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} hr ago`
      activity.push({
        action: `Fraud alert: ${alert.alertType.replace(/_/g, ' ')} detected`,
        time: timeStr,
        type: 'fraud',
      })
    }

    for (const match of recentMatches) {
      const mins = Math.max(1, Math.floor((Date.now() - match.createdAt.getTime()) / 60000))
      const timeStr = mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} hr ago`
      activity.push({
        action: `3-Way Match completed — ${match.matchStatus.replace('_', ' ')} (${match.confidenceScore}%)`,
        time: timeStr,
        type: 'match',
      })
    }

    activity.sort((a, b) => {
      const order: Record<string, number> = { fraud: 0, match: 1, upload: 2 }
      return (order[a.type] || 3) - (order[b.type] || 3)
    })

    return NextResponse.json({
      success: true,
      stats: {
        totalDocuments,
        activeVendors: vendorSet.size,
        openFraudAlerts: fraudAlerts,
        totalSpend,
        currency,
        totalMatches: matches,
        totalInvoices: invoices,
      },
      cards: {
        invoiceStatus: { processed: processedCount, flagged: flaggedCount, total: invoices },
        riskScore: {
          average: recentProcessedDocs.length > 0
            ? Math.round(recentProcessedDocs.reduce((s, d) => s + (d.riskScore || 0), 0) / recentProcessedDocs.length)
            : 0,
          high: recentProcessedDocs.filter((d) => (d.riskScore || 0) >= 60).length,
          medium: recentProcessedDocs.filter((d) => { const r = d.riskScore || 0; return r >= 30 && r < 60 }).length,
          low: recentProcessedDocs.filter((d) => (d.riskScore || 0) < 30).length,
        },
        ocrConfidence: avgConfidence,
        validationStatus: { passed: processedCount, failed: flaggedCount, passRate: (processedCount + flaggedCount) > 0 ? Math.round((processedCount / (processedCount + flaggedCount)) * 100) : 100 },
        complianceScore: avgCompliance,
        vendorReliability: avgReliability,
        matchStats: { matched: matchedCount, partial: partialCount, mismatched: mismatchCount, avgConfidence: avgMatchConfidence },
        priceDifference: { avgChange: avgPriceChange, itemsAnalyzed: priceAnalysisCount },
        potentialSavings,
        recommendedAction,
        actionBreakdown: { approve: approveCount, review: reviewCount, reject: rejectCount },
      },
      activity,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}