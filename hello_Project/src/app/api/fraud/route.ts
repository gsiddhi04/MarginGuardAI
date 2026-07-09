import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runFraudDetection } from '@/lib/fraud-detector'

export async function POST() {
  try {
    // Clear old "open" alerts before running fresh check
    await db.fraudAlert.deleteMany({ where: { status: 'open' } })

    // Run all fraud checks
    const alerts = await runFraudDetection()

    return NextResponse.json({
      success: true,
      totalAlerts: alerts.length,
      criticalCount: alerts.filter((a) => a.severity === 'critical').length,
      highCount: alerts.filter((a) => a.severity === 'high').length,
      mediumCount: alerts.filter((a) => a.severity === 'medium').length,
      lowCount: alerts.filter((a) => a.severity === 'low').length,
      alerts,
    })
  } catch (error) {
    console.error('Fraud detection error:', error)
    return NextResponse.json(
      { error: 'Fraud detection failed.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const alerts = await db.fraudAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      success: true,
      alerts,
      stats: {
        open: alerts.filter((a) => a.status === 'open').length,
        investigating: alerts.filter((a) => a.status === 'investigating').length,
        resolved: alerts.filter((a) => a.status === 'resolved').length,
      },
    })
  } catch (error) {
    console.error('Fetch fraud alerts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch fraud alerts.' },
      { status: 500 }
    )
  }
}