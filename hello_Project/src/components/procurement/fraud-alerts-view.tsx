'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  ShieldCheck,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  Search,
  Eye,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/app-store'
import { toast } from 'sonner'

interface FraudAlert {
  id: string
  alertType: string
  severity: string
  description: string
  status: string
  documentId: string
  vendorId: string | null
  createdAt: string
}

const severityConfig: Record<string, { color: string; icon: typeof AlertTriangle; bgColor: string }> = {
  critical: { color: 'text-red-600', icon: AlertTriangle, bgColor: 'bg-red-50 border-red-200' },
  high: { color: 'text-orange-600', icon: AlertTriangle, bgColor: 'bg-orange-50 border-orange-200' },
  medium: { color: 'text-amber-600', icon: AlertTriangle, bgColor: 'bg-amber-50 border-amber-200' },
  low: { color: 'text-blue-600', icon: AlertTriangle, bgColor: 'bg-blue-50 border-blue-200' },
}

const typeLabels: Record<string, string> = {
  duplicate_invoice: 'Duplicate Invoice',
  price_anomaly: 'Price Anomaly',
  suspicious_round_amount: 'Suspicious Amount',
  missing_purchase_order: 'Missing PO',
  weekend_date: 'Weekend Date',
  new_vendor_high_amount: 'New Vendor Risk',
  amount_mismatch: 'Amount Mismatch',
  vendor_risk: 'Vendor Risk',
  contract_clause_missing: 'Missing Clause',
}

export function FraudAlertsView() {
  const { setFraudAlertCount } = useAppStore()
  const [alerts, setAlerts] = useState<FraudAlert[]>([])
  const [stats, setStats] = useState({ open: 0, investigating: 0, resolved: 0 })
  const [scanning, setScanning] = useState(false)
  const [hasRunScan, setHasRunScan] = useState(false)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/fraud')
      const data = await res.json()
      if (data.success) {
        setAlerts(data.alerts)
        setStats(data.stats)
        setFraudAlertCount(data.stats.open)
      }
    } catch { /* silent */ }
  }, [setFraudAlertCount])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const runScan = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/fraud', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setHasRunScan(true)
        toast.success(`Scan complete: ${data.totalAlerts} alerts found (${data.criticalCount} critical, ${data.highCount} high)`)
        fetchAlerts()
      } else {
        toast.error(data.error || 'Scan failed')
      }
    } catch {
      toast.error('Failed to run fraud scan')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fraud & Anomaly Alerts</h1>
          <p className="text-muted-foreground mt-1">
            AI-detected risks: duplicate invoices, price anomalies, suspicious vendors
          </p>
        </div>
        <Button onClick={runScan} disabled={scanning} className="gap-2">
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {scanning ? 'Scanning...' : 'Run Fraud Scan'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.open}</p>
            <p className="text-xs text-muted-foreground">Open</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.investigating}</p>
            <p className="text-xs text-muted-foreground">Investigating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.resolved}</p>
            <p className="text-xs text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Detection Rules Info */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium mb-2">Detection Rules Active:</p>
          <div className="flex flex-wrap gap-2">
            {['Duplicate Invoice Detection', 'Price Anomaly (Z-Score)', 'Round Amount Analysis', 'Missing PO Check', 'Weekend Date Flag', 'New Vendor Risk'].map((rule) => (
              <Badge key={rule} variant="outline" className="text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                {rule}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Alerts List */}
      {!hasRunScan ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <p className="font-medium">Ready to Scan</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              Upload documents first, then click &quot;Run Fraud Scan&quot; to analyze all documents for fraud patterns and anomalies.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => useAppStore.getState().setActiveTab('documents')}>
              Go to Documents
            </Button>
          </CardContent>
        </Card>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
            <p className="font-medium text-emerald-600">No Fraud Alerts Found</p>
            <p className="text-sm text-muted-foreground mt-1">All documents passed fraud detection checks.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const config = severityConfig[alert.severity] || severityConfig.medium
            const Icon = config.icon
            return (
              <Card key={alert.id} className={`border-l-4 ${alert.severity === 'critical' ? 'border-l-red-500' : alert.severity === 'high' ? 'border-l-orange-500' : alert.severity === 'medium' ? 'border-l-amber-400' : 'border-l-blue-400'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {typeLabels[alert.alertType] || alert.alertType}
                        </span>
                        <Badge
                          variant={alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {alert.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {alert.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}