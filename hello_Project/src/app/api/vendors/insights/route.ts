import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVendorProfiles } from '@/lib/vendor-analytics'

export async function GET() {
  try {
    const profiles = await getVendorProfiles()
    return NextResponse.json({ success: true, vendors: profiles })
  } catch (error) {
    console.error('Vendor insights API error:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor insights' }, { status: 500 })
  }
}