/**
 * Vendor Analytics Engine — Fully Offline
 *
 * Scans all documents to build per-vendor profiles:
 * - Total orders, total spend, average order value
 * - Document type distribution
 * - Reliability score (based on match results, fraud alerts, validation)
 * - First seen / last seen dates
 * - Compliance score
 */

import { db } from '@/lib/db'
import { ExtractedDocument } from './llm'

export interface VendorProfile {
  name: string
  email: string
  phone: string
  totalDocuments: number
  totalInvoices: number
  totalPOs: number
  totalContracts: number
  totalGRNs: number
  totalSpend: number
  currency: string
  averageOrderValue: number
  highestOrder: number
  lowestOrder: number
  firstSeen: string
  lastSeen: string
  reliabilityScore: number  // 0-100
  complianceScore: number   // 0-100
  riskLevel: 'Low' | 'Medium' | 'High'
  fraudAlertCount: number
  matchResults: Array<{ status: string; confidence: number }>
  recentDocuments: Array<{ id: string; filename: string; fileType: string; amount: number; date: string }>
}

function parseData(doc: { extractedData: string | null }): ExtractedDocument | null {
  if (!doc.extractedData) return null
  try { return JSON.parse(doc.extractedData) as ExtractedDocument } catch { return null }
}

export async function getVendorProfiles(): Promise<VendorProfile[]> {
  const documents = await db.document.findMany({
    orderBy: { createdAt: 'asc' },
  })

  const fraudAlerts = await db.fraudAlert.findMany()
  const matches = await db.threeWayMatch.findMany()

  // Group by vendor
  const vendorMap = new Map<string, {
    docs: typeof documents,
    data: ExtractedDocument[],
    amounts: number[],
    fraudCount: number,
    matchResults: Array<{ status: string; confidence: number }>,
  }>()

  for (const doc of documents) {
    const data = parseData(doc)
    if (!data?.vendorName) continue

    const key = data.vendorName.toLowerCase()
    if (!vendorMap.has(key)) {
      vendorMap.set(key, { docs: [], data: [], amounts: [], fraudCount: 0, matchResults: [] })
    }
    const entry = vendorMap.get(key)!
    entry.docs.push(doc)
    entry.data.push(data)
    if (doc.amount > 0) entry.amounts.push(doc.amount)
  }

  // Count fraud per vendor
  for (const alert of fraudAlerts) {
    const alertDoc = documents.find((d) => d.id === alert.documentId)
    if (alertDoc) {
      const data = parseData(alertDoc)
      if (data?.vendorName) {
        const key = data.vendorName.toLowerCase()
        const entry = vendorMap.get(key)
        if (entry) entry.fraudCount++
      }
    }
  }

  // Match results per vendor
  for (const match of matches) {
    // Find documents linked to this match
    const matchDoc = documents.find((d) => d.id === match.documentId)
    if (matchDoc) {
      const data = parseData(matchDoc)
      if (data?.vendorName) {
        const key = data.vendorName.toLowerCase()
        const entry = vendorMap.get(key)
        if (entry) {
          entry.matchResults.push({ status: match.matchStatus, confidence: match.confidenceScore })
        }
      }
    }
  }

  const profiles: VendorProfile[] = []

  for (const [name, entry] of vendorMap) {
    const realName = entry.data.find((d) => d.vendorName)?.vendorName || name
    const firstData = entry.data[0]
    const lastData = entry.data[entry.data.length - 1]

    const invoices = entry.docs.filter((d) => d.fileType === 'invoice')
    const pos = entry.docs.filter((d) => d.fileType === 'po')
    const contracts = entry.docs.filter((d) => d.fileType === 'contract')
    const grns = entry.docs.filter((d) => d.fileType === 'grn')

    const totalSpend = invoices.reduce((s, d) => s + (d.amount || 0), 0)
    const avgOrder = entry.amounts.length > 0 ? entry.amounts.reduce((a, b) => a + b, 0) / entry.amounts.length : 0
    const highest = entry.amounts.length > 0 ? Math.max(...entry.amounts) : 0
    const lowest = entry.amounts.length > 0 ? Math.min(...entry.amounts) : 0

    // Reliability score: based on match results and fraud
    let reliability = 100
    if (entry.fraudCount > 0) reliability -= entry.fraudCount * 15
    for (const m of entry.matchResults) {
      if (m.status === 'mismatch') reliability -= 20
      else if (m.status === 'partial_match') reliability -= 8
    }
    if (entry.docs.length === 1) reliability -= 10 // new vendor
    reliability = Math.max(0, Math.min(100, reliability))

    // Compliance score: based on extraction quality
    let compliance = 0
    let compCount = 0
    for (const d of entry.data) {
      let score = 0
      if (d.vendorName) score += 25
      if (d.documentNumber) score += 20
      if (d.documentDate) score += 15
      if (d.totalAmount > 0) score += 25
      if (d.items.length > 0) score += 15
      compliance += score
      compCount++
    }
    compliance = compCount > 0 ? Math.round(compliance / compCount) : 0

    const riskLevel: VendorProfile['riskLevel'] =
      entry.fraudCount >= 2 || reliability < 50 ? 'High' :
      entry.fraudCount >= 1 || reliability < 75 ? 'Medium' : 'Low'

    profiles.push({
      name: realName,
      email: firstData?.vendorEmail || '',
      phone: firstData?.vendorPhone || '',
      totalDocuments: entry.docs.length,
      totalInvoices: invoices.length,
      totalPOs: pos.length,
      totalContracts: contracts.length,
      totalGRNs: grns.length,
      totalSpend,
      currency: firstData?.currency || 'USD',
      averageOrderValue: Math.round(avgOrder),
      highestOrder: highest,
      lowestOrder: lowest,
      firstSeen: entry.docs[0]?.createdAt.toISOString() || '',
      lastSeen: entry.docs[entry.docs.length - 1]?.createdAt.toISOString() || '',
      reliabilityScore: reliability,
      complianceScore: compliance,
      riskLevel,
      fraudAlertCount: entry.fraudCount,
      matchResults: entry.matchResults,
      recentDocuments: entry.docs.slice(-5).reverse().map((d) => ({
        id: d.id,
        filename: d.filename,
        fileType: d.fileType,
        amount: d.amount || 0,
        date: d.documentDate || d.createdAt.toISOString().split('T')[0],
      })),
    })
  }

  // Sort by total spend descending
  profiles.sort((a, b) => b.totalSpend - a.totalSpend)

  return profiles
}

export async function getVendorProfile(vendorName: string): Promise<VendorProfile | null> {
  const profiles = await getVendorProfiles()
  return profiles.find((p) => p.name.toLowerCase() === vendorName.toLowerCase()) || null
}