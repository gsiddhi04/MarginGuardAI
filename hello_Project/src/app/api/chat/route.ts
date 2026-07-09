import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchDocuments, getDocumentSummary, getIndexStats } from '@/lib/rag'
import { randomUUID } from 'crypto'

// ===== RESPONSE GENERATION =====

interface ChatContext {
  query: string
  searchResults: Awaited<ReturnType<typeof searchDocuments>>
  documentSummaries: string[]
  indexStats: ReturnType<typeof getIndexStats>
}

/**
 * Generate a response based on query + RAG results (fully offline, no LLM needed)
 */
function generateResponse(ctx: ChatContext): { answer: string; sources: string[] } {
  const { query, searchResults, documentSummaries, indexStats } = ctx
  const q = query.toLowerCase()
  const sources: string[] = []

  // Extract source filenames
  for (const r of searchResults) {
    if (r.chunk.filename && !sources.includes(r.chunk.filename)) {
      sources.push(r.chunk.filename)
    }
  }

  // ===== HELPER: Find data from DB summaries =====
  const vendorInfo = documentSummaries
    .map((s) => s.split('\n'))
    .flat()
    .filter((l) => l.toLowerCase().startsWith('vendor:'))
    .map((l) => l.replace(/^vendor:\s*/i, ''))

  const amountInfo = documentSummaries
    .map((s) => {
      const lines = s.split('\n')
      const filename = lines[0]?.replace('Document: ', '') || ''
      const amountLine = lines.find((l) => l.startsWith('Amount:'))
      const typeLine = lines.find((l) => l.startsWith('Type:'))
      return { filename, amount: amountLine, type: typeLine }
    })
    .filter((i) => i.amount)

  // ===== PATTERN MATCHING =====

  // Q: "how many documents" / "total documents"
  if (q.includes('how many') && (q.includes('document') || q.includes('invoice') || q.includes('file'))) {
    const count = indexStats.chunkCount
    const docCount = documentSummaries.length
    return {
      answer: `You currently have **${docCount} documents** uploaded and indexed (${count} searchable chunks).\n\n${docCount === 0 ? 'Upload some procurement documents to get started!' : `These include invoices, purchase orders, GRNs, contracts, and quotations.`}`,
      sources,
    }
  }

  // Q: "which vendor" / "best vendor" / "vendor with best price"
  if (q.includes('vendor') && (q.includes('best') || q.includes('cheapest') || q.includes('lowest') || q.includes('price'))) {
    if (documentSummaries.length === 0) {
      return { answer: 'No documents uploaded yet. Upload vendor invoices to compare pricing.', sources: [] }
    }

    // Extract vendor + amount pairs
    const vendorAmounts: Record<string, { total: number; count: number; currency: string }> = {}
    for (const summary of documentSummaries) {
      const lines = summary.split('\n')
      const vendorLine = lines.find((l) => l.startsWith('Vendor:'))
      const amountLine = lines.find((l) => l.startsWith('Amount:'))
      if (vendorLine && amountLine) {
        const vendor = vendorLine.replace('Vendor: ', '').trim()
        const match = amountLine.match(/Amount:\s*(\w+)\s*([\d,]+)/)
        if (match) {
          const amount = parseFloat(match[2].replace(/,/g, ''))
          if (!vendorAmounts[vendor]) vendorAmounts[vendor] = { total: 0, count: 0, currency: match[1] }
          vendorAmounts[vendor].total += amount
          vendorAmounts[vendor].count++
          vendorAmounts[vendor].currency = match[1]
        }
      }
    }

    const vendors = Object.entries(vendorAmounts).sort((a, b) => a[1].total - b[1].total)
    if (vendors.length === 0) {
      return { answer: 'I couldn\'t find vendor pricing data in your documents. Make sure you\'ve uploaded invoices with extractable amounts.', sources }
    }

    const lines = ['Here\'s a comparison of vendor totals from your documents:\n']
    for (const [vendor, data] of vendors) {
      lines.push(`• **${vendor}** — ${data.currency} ${data.total.toLocaleString()} across ${data.count} document(s)`)
    }
    lines.push(`\nBased on total billing, **${vendors[0][0]}** has the lowest total at ${vendors[0][1].currency} ${vendors[0][1].total.toLocaleString()}.`)
    return { answer: lines.join('\n'), sources }
  }

  // Q: "show pending invoices" / "pending" / "unpaid"
  if (q.includes('pending') || q.includes('unpaid') || q.includes('not paid') || q.includes('open invoice')) {
    const pending = documentSummaries.filter((s) => {
      const lines = s.split('\n')
      const typeLine = lines.find((l) => l.startsWith('Type:'))
      return typeLine?.toLowerCase().includes('invoice')
    })

    if (pending.length === 0) return { answer: 'No invoices found in your documents.', sources: [] }

    const lines = [`You have **${pending.length} invoice(s)** on file:\n`]
    for (const summary of pending) {
      const sLines = summary.split('\n')
      const filename = sLines[0]?.replace('Document: ', '') || ''
      const vendor = sLines.find((l) => l.startsWith('Vendor:'))?.replace('Vendor: ', '') || 'Unknown'
      const amount = sLines.find((l) => l.startsWith('Amount:')) || 'Amount: N/A'
      const date = sLines.find((l) => l.startsWith('Date:'))?.replace('Date: ', '') || ''
      lines.push(`• ${filename} — ${amount.replace('Amount: ', '')} from **${vendor}**${date ? ` (${date})` : ''}`)
    }
    lines.push('\n> Note: Invoice payment status is not yet tracked. Run 3-Way Matching to verify invoice accuracy.')
    return { answer: lines.join('\n'), sources }
  }

  // Q: "riskiest vendors" / "vendor risk" / "suspicious vendor"
  if (q.includes('risk') && q.includes('vendor')) {
    // Check fraud alerts
    return {
      answer: `Go to the **Fraud Alerts** tab and click **"Run Fraud Scan"** to analyze all documents for vendor risks.\n\nThe scan checks for:\n• Duplicate invoices from same vendor\n• Price anomalies (abnormal billing amounts)\n• New vendors with high-value invoices\n• Invoices without matching Purchase Orders`,
      sources: [],
    }
  }

  // Q: "summarize contract" / "contract clause" / "contract"
  if (q.includes('contract')) {
    const contracts = documentSummaries.filter((s) => s.includes('Type: contract'))
    if (contracts.length === 0) {
      return { answer: 'No contracts found in your uploaded documents. Upload a contract file to analyze its clauses.', sources: [] }
    }
    const lines = [`Found **${contracts.length} contract(s)**:\n`]
    for (const summary of contracts) {
      lines.push(`\`\`\`\n${summary}\n\`\`\``)
    }
    return { answer: lines.join('\n'), sources }
  }

  // Q: "compare prices" / "price comparison" / "material price"
  if (q.includes('compar') || q.includes('price') || q.includes('rate') || q.includes('cost')) {
    if (searchResults.length > 0) {
      const lines = ['Here\'s what I found in your documents related to prices:\n']
      for (const r of searchResults.slice(0, 5)) {
        lines.push(`> **${r.chunk.filename}**: ${r.chunk.text.substring(0, 200)}...`)
      }
      return { answer: lines.join('\n'), sources }
    }
    return { answer: 'No pricing data found. Upload invoices or quotations to compare prices.', sources: [] }
  }

  // Q: "what can you do" / "help" / "capabilities"
  if (q.includes('help') || q.includes('what can you') || q.includes('capabilit')) {
    return {
      answer: `I'm your **AI Procurement Copilot**. Here's what I can help with:\n\n• **Document Search** — Ask about any content in your uploaded documents\n• **Vendor Analysis** — Compare vendor pricing, find best vendors\n• **Invoice Status** — Show invoices, amounts, and details\n• **Risk Assessment** — Direct you to fraud detection results\n• **Contract Review** — Summarize contract details\n• **Price Comparison** — Compare material prices across vendors\n• **3-Way Matching** — Explain matching results and discrepancies\n\nTry asking: *"Which vendor has the lowest total billing?"* or *"Show all invoices"*`,
      sources: [],
    }
  }

  // Q: "total spend" / "how much" / "spending"
  if (q.includes('total spend') || q.includes('spending') || q.includes('how much') || (q.includes('total') && q.includes('amount'))) {
    let grandTotal = 0
    let currency = 'USD'
    for (const summary of documentSummaries) {
      const amountLine = summary.split('\n').find((l) => l.startsWith('Amount:'))
      if (amountLine) {
        const match = amountLine.match(/Amount:\s*(\w+)\s*([\d,]+)/)
        if (match) {
          grandTotal += parseFloat(match[2].replace(/,/g, ''))
          currency = match[1]
        }
      }
    }
    return {
      answer: `**Total documented spend: ${currency} ${grandTotal.toLocaleString()}** across ${documentSummaries.length} document(s).`,
      sources,
    }
  }

  // Q: "match" / "matching" / "discrepancy"
  if (q.includes('match') || q.includes('discrepanc') || q.includes('three way') || q.includes('3-way')) {
    return {
      answer: `Go to the **3-Way Match** tab to run PO ↔ GRN ↔ Invoice reconciliation.\n\nThe matching engine:\n1. Fuzzy-matches line items across documents\n2. Compares quantities, prices, and totals\n3. Detects missing items and discrepancies\n4. Gives a confidence score (0-100%)\n\nUpload a PO, GRN, and Invoice, then select them and click "Run Three-Way Match".`,
      sources: [],
    }
  }

  // ===== FALLBACK: RAG-BASED RESPONSE =====

  if (searchResults.length > 0) {
    const lines = [`Based on your documents, here's what I found:\n`]
    for (const r of searchResults.slice(0, 3)) {
      lines.push(`**From ${r.chunk.filename}:**`)
      if (r.highlights.length > 0) {
        lines.push(`> ${r.highlights[0]}`)
      } else {
        lines.push(`> ${r.chunk.text.substring(0, 250)}...`)
      }
      lines.push('')
    }
    if (searchResults.length > 3) {
      lines.push(`*(and ${searchResults.length - 3} more relevant results)*`)
    }
    return { answer: lines.join('\n'), sources }
  }

  // ===== NO RESULTS =====
  if (documentSummaries.length === 0) {
    return {
      answer: 'I don\'t have any documents to search yet. Upload some procurement documents (invoices, POs, contracts) in the **Documents** tab, and I\'ll be able to answer questions about them.',
      sources: [],
    }
  }

  return {
    answer: `I couldn't find specific information about "${query}" in your documents.\n\nTry asking about:\n• Vendor names or pricing\n• Invoice amounts and dates\n• Document contents\n• Or type **"help"** to see what I can do`,
    sources: [],
  }
}

// ===== API ROUTES =====

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json()

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'Message and sessionId required' }, { status: 400 })
    }

    // Save user message
    await db.chatMessage.create({
      data: { sessionId, role: 'user', content: message },
    })

    // Get recent conversation context (last 10 messages)
    const recentMessages = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 10,
    })

    // Search documents using RAG
    const searchResults = await searchDocuments(message, 5)

    // Get document summaries
    const documents = await db.document.findMany({
      where: { extractedData: { not: null } },
      select: { id: true },
    })
    const documentSummaries: string[] = []
    for (const doc of documents) {
      const summary = await getDocumentSummary(doc.id)
      if (summary) documentSummaries.push(summary)
    }

    // Get index stats
    const indexStats = getIndexStats()

    // Generate response
    const { answer, sources } = generateResponse({
      query: message,
      searchResults,
      documentSummaries,
      indexStats,
    })

    // Save assistant message
    await db.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: answer,
        sources: JSON.stringify(sources),
      },
    })

    return NextResponse.json({
      success: true,
      answer,
      sources,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: 'Chat failed.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const messages = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      success: true,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ? JSON.parse(m.sources) : [],
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    console.error('Fetch chat history error:', error)
    return NextResponse.json({ error: 'Failed to fetch chat history.' }, { status: 500 })
  }
}