/**
 * RAG (Retrieval Augmented Generation) System — Fully Offline
 *
 * Uses TF-IDF-inspired keyword search to find relevant document chunks.
 * No external vector database needed — runs entirely in memory.
 */

import { db } from '@/lib/db'

// ===== TYPES =====

export interface DocumentChunk {
  id: string
  documentId: string
  filename: string
  fileType: string
  chunkIndex: number
  text: string
  metadata: Record<string, string>
}

export interface SearchResult {
  chunk: DocumentChunk
  score: number
  highlights: string[]
}

// ===== STOPWORDS =====

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
  'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
  'them', 'his', 'her', 'their', 'we', 'our', 'you', 'your', 'i', 'my',
  'me', 'what', 'which', 'who', 'whom', 'also', 'any', 'per', 'etc',
])

// ===== TEXT PROCESSING =====

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
}

function computeFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1)
  }
  return freq
}

// ===== DOCUMENT CHUNKING =====

const CHUNK_SIZE = 500 // characters per chunk
const CHUNK_OVERLAP = 100 // overlap between chunks

export function chunkDocument(text: string): string[] {
  if (!text || text.length === 0) return []

  const chunks: string[] = []

  if (text.length <= CHUNK_SIZE) {
    chunks.push(text)
    return chunks
  }

  let start = 0
  while (start < text.length) {
    let end = start + CHUNK_SIZE

    // Try to break at a sentence or line boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end)
      const lastNewline = text.lastIndexOf('\n', end)
      const breakPoint = Math.max(lastPeriod, lastNewline)

      if (breakPoint > start + CHUNK_SIZE * 0.3) {
        end = breakPoint + 1
      }
    }

    chunks.push(text.substring(start, Math.min(end, text.length)).trim())
    start = end - CHUNK_OVERLAP

    if (start >= text.length) break
  }

  return chunks.filter((c) => c.length > 20)
}

// ===== INDEXING =====

// In-memory index: maps terms -> list of { chunkId, frequency }
let index: Map<string, Array<{ chunkId: string; frequency: number }>> | null = null
// Store all chunks in memory for retrieval
let chunkStore: Map<string, DocumentChunk> | null = null
let indexTime: number = 0
const INDEX_TTL = 5 * 60 * 1000 // Rebuild index every 5 minutes

export async function buildIndex(): Promise<{ chunks: DocumentChunk[]; totalTerms: number }> {
  const documents = await db.document.findMany({
    where: { extractedText: { not: null } },
    select: {
      id: true,
      filename: true,
      fileType: true,
      extractedText: true,
      extractedData: true,
    },
  })

  const newIndex = new Map<string, Array<{ chunkId: string; frequency: number }>>()
  const newChunkStore = new Map<string, DocumentChunk>()
  let totalTerms = 0

  for (const doc of documents) {
    if (!doc.extractedText) continue

    const chunks = chunkDocument(doc.extractedText)
    const docData = doc.extractedData ? JSON.parse(doc.extractedData) : {}

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${doc.id}::${i}`
      const tokens = tokenize(chunks[i])
      const freq = computeFrequency(tokens)
      totalTerms += tokens.length

      const chunk: DocumentChunk = {
        id: chunkId,
        documentId: doc.id,
        filename: doc.filename,
        fileType: doc.fileType,
        chunkIndex: i,
        text: chunks[i],
        metadata: {
          vendorName: docData.vendorName || '',
          documentNumber: docData.documentNumber || '',
          totalAmount: docData.totalAmount?.toString() || '',
          currency: docData.currency || '',
          documentDate: docData.documentDate || '',
        },
      }

      newChunkStore.set(chunkId, chunk)

      // Add to inverted index
      for (const [term, count] of freq) {
        if (!newIndex.has(term)) {
          newIndex.set(term, [])
        }
        newIndex.get(term)!.push({ chunkId, frequency: count })
      }
    }
  }

  index = newIndex
  chunkStore = newChunkStore
  indexTime = Date.now()

  return {
    chunks: Array.from(newChunkStore.values()),
    totalTerms,
  }
}

async function ensureIndex() {
  if (!index || !chunkStore || Date.now() - indexTime > INDEX_TTL) {
    await buildIndex()
  }
}

// ===== SEARCH =====

export async function searchDocuments(query: string, limit = 5): Promise<SearchResult[]> {
  await ensureIndex()

  if (!index || !chunkStore) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  // Score each relevant chunk
  const chunkScores = new Map<string, { score: number; matchedTerms: string[]; highlights: string[] }>()

  for (const token of queryTokens) {
    const entries = index.get(token)
    if (!entries) continue

    for (const entry of entries) {
      const existing = chunkScores.get(entry.chunkId) || { score: 0, matchedTerms: [], highlights: [] }
      existing.score += entry.frequency // TF component
      existing.matchedTerms.push(token)

      // Extract highlight (sentence containing the term)
      const chunk = chunkStore.get(entry.chunkId)
      if (chunk) {
        const sentences = chunk.text.split(/[.!?]\s+/)
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(token) && existing.highlights.length < 2) {
            existing.highlights.push(sentence.trim())
          }
        }
      }

      chunkScores.set(entry.chunkId, existing)
    }
  }

  // Apply IDF weighting: terms that appear in fewer chunks are more valuable
  const totalChunks = chunkStore.size
  for (const token of queryTokens) {
    const entries = index.get(token)
    if (!entries) continue
    const idf = Math.log((totalChunks + 1) / (entries.length + 1)) + 1

    for (const entry of entries) {
      const existing = chunkScores.get(entry.chunkId)
      if (existing) {
        existing.score *= idf
      }
    }
  }

  // Boost chunks that match more unique query terms (coverage)
  for (const [, data] of chunkScores) {
    const coverage = data.matchedTerms.length / queryTokens.length
    data.score *= (1 + coverage)
  }

  // Sort by score and return top results
  const results: SearchResult[] = Array.from(chunkScores.entries())
    .map(([chunkId, data]) => ({
      chunk: chunkStore.get(chunkId)!,
      score: Math.round(data.score * 100) / 100,
      highlights: data.highlights,
    }))
    .filter((r) => r.chunk)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return results
}

// ===== DOCUMENT SUMMARIZATION =====

export async function getDocumentSummary(documentId: string): Promise<string | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      filename: true,
      fileType: true,
      extractedData: true,
      extractedText: true,
    },
  })

  if (!doc) return null

  const data = doc.extractedData ? JSON.parse(doc.extractedData) : {}
  const lines: string[] = []

  lines.push(`Document: ${doc.filename}`)
  lines.push(`Type: ${doc.fileType}`)

  if (data.vendorName) lines.push(`Vendor: ${data.vendorName}`)
  if (data.documentNumber) lines.push(`Number: ${data.documentNumber}`)
  if (data.documentDate) lines.push(`Date: ${data.documentDate}`)
  if (data.totalAmount) lines.push(`Amount: ${data.currency || 'USD'} ${data.totalAmount.toLocaleString()}`)

  if (data.items && data.items.length > 0) {
    lines.push(`\nItems (${data.items.length}):`)
    for (const item of data.items) {
      lines.push(`- ${item.description}: ${item.quantity} x ${item.unitPrice} = ${item.total}`)
    }
  }

  return lines.join('\n')
}

// ===== INDEX STATS =====

export function getIndexStats(): { isIndexed: boolean; chunkCount: number; termCount: number; lastIndexed: number } {
  return {
    isIndexed: index !== null && chunkStore !== null,
    chunkCount: chunkStore?.size || 0,
    termCount: index?.size || 0,
    lastIndexed: indexTime,
  }
}