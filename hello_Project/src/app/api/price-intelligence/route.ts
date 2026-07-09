import { NextResponse } from 'next/server'
import { analyzePriceIntelligence } from '@/lib/price-intelligence'

export async function GET() {
  try {
    const data = await analyzePriceIntelligence()
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('Price intelligence API error:', error)
    return NextResponse.json({ error: 'Failed to analyze prices' }, { status: 500 })
  }
}