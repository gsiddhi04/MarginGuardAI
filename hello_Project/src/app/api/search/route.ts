import { NextRequest, NextResponse } from 'next/server'
import { searchDocuments, getIndexStats } from '@/lib/rag'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '5')

    if (!query.trim()) {
      const stats = getIndexStats()
      return NextResponse.json({
        success: true,
        query: '',
        results: [],
        indexStats: stats,
      })
    }

    const results = await searchDocuments(query, limit)
    const stats = getIndexStats()

    return NextResponse.json({
      success: true,
      query,
      results: results.map((r) => ({
        documentId: r.chunk.documentId,
        filename: r.chunk.filename,
        fileType: r.chunk.fileType,
        chunkText: r.chunk.text,
        score: r.score,
        highlights: r.highlights,
        metadata: r.chunk.metadata,
      })),
      indexStats: stats,
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed.' },
      { status: 500 }
    )
  }
}