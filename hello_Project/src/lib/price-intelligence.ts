/**
 * Price Intelligence Engine — Fully Offline
 *
 * Compares line item prices across all documents to detect:
 * - Price increases/decreases vs historical average
 * - Most expensive vs cheapest vendor per material
 * - Price trends per material
 */

import { db } from '@/lib/db'
import { ExtractedDocument } from './llm'

export interface PriceComparison {
  description: string
  currentPrice: number
  historicalAverage: number
  historicalMin: number
  historicalMax: number
  priceChange: number       // percentage change from average
  trend: 'up' | 'down' | 'stable' | 'new'
  sampleCount: number
  vendorName: string
  currency: string
}

export interface MaterialPriceSummary {
  material: string
  vendors: Array<{
    vendorName: string
    latestPrice: number
    avgPrice: number
    orderCount: number
    currency: string
  }>
  overallAverage: number
  priceRange: { min: number; max: number; spread: number }
}

function parseData(doc: { extractedData: string | null }): ExtractedDocument | null {
  if (!doc.extractedData) return null
  try { return JSON.parse(doc.extractedData) as ExtractedDocument } catch { return null }
}

/** Normalize item description for grouping (remove SKU, quantities, units) */
function normalizeDescription(desc: string): string {
  return desc
    .replace(/\s{2,}/g, ' ')
    .replace(/\bSKU-[\w-]+/gi, '')
    .replace(/\b\d+(\.\d+)?\s*(bundle|unit|set|kg|mt|tons?|pcs?|m\.?|ft\.?)\b/gi, '')
    .replace(/\b\d+\s*x\s*\d+/gi, '')
    .trim()
    .toLowerCase()
}

/** Group similar descriptions */
function descriptionKey(desc: string): string {
  const normalized = normalizeDescription(desc)
  // Take first 3 meaningful words
  const words = normalized.split(/\s+/).filter((w) => w.length > 2).slice(0, 4)
  return words.join(' ') || normalized
}

export async function analyzePriceIntelligence(): Promise<{
  comparisons: PriceComparison[]
  materials: MaterialPriceSummary[]
  potentialSavings: number
  currency: string
}> {
  const documents = await db.document.findMany({
    orderBy: { createdAt: 'asc' },
  })

  // Collect all line items with context
  interface PriceEntry {
    description: string
    key: string
    unitPrice: number
    vendorName: string
    currency: string
    date: string
    docId: string
  }

  const allEntries: PriceEntry[] = []

  for (const doc of documents) {
    const data = parseData(doc)
    if (!data?.items) continue

    for (const item of data.items) {
      allEntries.push({
        description: item.description,
        key: descriptionKey(item.description),
        unitPrice: item.unitPrice,
        vendorName: data.vendorName || 'Unknown',
        currency: data.currency || 'USD',
        date: doc.documentDate || doc.createdAt.toISOString().split('T')[0],
        docId: doc.id,
      })
    }
  }

  // Group by material key
  const materialGroups = new Map<string, PriceEntry[]>()
  for (const entry of allEntries) {
    if (!materialGroups.has(entry.key)) materialGroups.set(entry.key, [])
    materialGroups.get(entry.key)!.push(entry)
  }

  const comparisons: PriceComparison[] = []
  const materials: MaterialPriceSummary[] = []
  let potentialSavings = 0

  for (const [key, entries] of materialGroups) {
    const prices = entries.map((e) => e.unitPrice).filter((p) => p > 0)
    if (prices.length < 2) continue

    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    const min = Math.min(...prices)
    const max = Math.max(...prices)

    // Find latest entry for each vendor
    const vendorMap = new Map<string, { latest: PriceEntry; prices: number[] }>()
    for (const entry of entries) {
      if (!vendorMap.has(entry.vendorName)) {
        vendorMap.set(entry.vendorName, { latest: entry, prices: [] })
      }
      vendorMap.get(entry.vendorName)!.prices.push(entry.unitPrice)
      // Update latest if this entry is more recent
      if (entry.date >= vendorMap.get(entry.vendorName)!.latest.date) {
        vendorMap.get(entry.vendorName)!.latest = entry
      }
    }

    // Build comparison for the most recent entry
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
    const latest = sorted[0]
    const priceChange = avg > 0 ? ((latest.unitPrice - avg) / avg) * 100 : 0

    comparisons.push({
      description: latest.description,
      currentPrice: latest.unitPrice,
      historicalAverage: Math.round(avg * 100) / 100,
      historicalMin: min,
      historicalMax: max,
      priceChange: Math.round(priceChange * 10) / 10,
      trend: priceChange > 3 ? 'up' : priceChange < -3 ? 'down' : 'stable',
      sampleCount: entries.length,
      vendorName: latest.vendorName,
      currency: latest.currency,
    })

    // If current price is above average, calculate potential savings
    if (latest.unitPrice > avg) {
      const savingPerUnit = latest.unitPrice - avg
      // Assume same quantity as in the latest entry's document
      potentialSavings += savingPerUnit
    }

    // Material summary
    const vendorSummaries = Array.from(vendorMap.entries()).map(([name, data]) => ({
      vendorName: name,
      latestPrice: data.latest.unitPrice,
      avgPrice: Math.round((data.prices.reduce((a, b) => a + b, 0) / data.prices.length) * 100) / 100,
      orderCount: data.prices.length,
      currency: data.latest.currency,
    }))

    materials.push({
      material: latest.description,
      vendors: vendorSummaries,
      overallAverage: Math.round(avg * 100) / 100,
      priceRange: { min, max, spread: max - min },
    })
  }

  const currency = allEntries[0]?.currency || 'USD'

  return { comparisons, materials, potentialSavings: Math.round(potentialSavings * 100) / 100, currency }
}

export async function getDocumentPriceComparison(documentId: string): Promise<PriceComparison[]> {
  const doc = await db.document.findUnique({ where: { id: documentId } })
  if (!doc) return []

  const data = parseData(doc)
  if (!data?.items) return []

  const allComparisons = await analyzePriceIntelligence()

  // Filter to items in this document
  return allComparisons.comparisons.filter((c) =>
    data.items!.some((item) => descriptionKey(item.description) === descriptionKey(c.description))
  )
}