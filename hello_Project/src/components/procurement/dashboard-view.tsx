'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  GitCompareArrows,
  MessageSquare,
  Bot,
  ShieldCheck,
  BarChart3,
  TrendingDown,
  ThumbsUp,
  Eye,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/stores/app-store'
import { toast } from 'sonner'

interface DashboardStats {
  totalDocuments: number
  activeVendors: number
  openFraudAlerts: number
  totalSpend: number
  currency: string
  totalMatches: number
  totalInvoices: number
}

interface DashboardCards {
  invoiceStatus: { processed: number; flagged: number; total: number; passRate: number }
  riskScore: { average: number; high: number; medium: number; low: number }
  ocrConfidence: number
  validationStatus: { passed: number; failed: number; passRate: number }
  complianceScore: number
  vendorReliability: number
  matchStats: { matched: number; partial: number; mismatched: number; avgConfidence: number }
  priceDifference: { avgChange: number; itemsAnalyzed: number }
  potentialSavings: number
  recommendedAction: string
  actionBreakdown: { approve: number; review: number; reject: number }
}

interface Activity {
  action: string
  time: string
  type: string
}

export function DashboardView() {
  const { setActiveTab, setDocumentCount, setFraudAlertCount } = useAppStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [cards, setCards] = useState<DashboardCards | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      const data = await res.json()
      if (data.success) {
        setStats(data.stats)
        setCards(data.cards)
        setActivity(data.activity)
        setDocumentCount(data.stats.totalDocuments)
        setFraudAlertCount(data.stats.openFraudAlerts)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [setDocumentCount, setFraudAlertCount])

  const loadSampleData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`Loaded ${data.documents} sample documents!`)
        fetchDashboard()
      }
    } catch {
      toast.error('Failed to load sample data')
    }
    setLoading(false)
  }

  if (!initialized) {
    setInitialized(true)
    fetchDashboard()
  }

  const hasData = stats && stats.totalDocuments > 0

  const actionColor = cards?.recommendedAction === 'Review Required'
    ? 'text-amber-600' : cards?.recommendedAction === 'Clear to Approve'
    ? 'text-emerald-600' : 'text-red-600'

  const actionBg = cards?.recommendedAction === 'Review Required'
    ? 'bg-amber-50 border-amber-200' : cards?.recommendedAction === 'Clear to Approve'
    ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">AI-powered construction procurement intelligence</p>
      </div>

      {!hasData && !loading && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Bot className="w-10 h-10 text-primary mb-3" />
            <p className="font-medium">Welcome to ProcureAI</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              No documents yet. Load sample demo data to explore all features, or upload your own procurement documents.
            </p>
            <Button className="mt-4" onClick={loadSampleData}>
              Load Demo Data
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && !hasData ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <p>Loading dashboard...</p>
        </div>
      ) : hasData && cards ? (
        <>
          {/* Row 1: Core Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'Total Documents', value: stats!.totalDocuments.toString(), sub: `${stats!.totalInvoices} invoices`, icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { title: 'Active Vendors', value: stats!.activeVendors.toString(), sub: 'from documents', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
              { title: 'Fraud Alerts', value: stats!.openFraudAlerts.toString(), sub: stats!.openFraudAlerts > 0 ? 'open alerts' : 'all clear', icon: AlertTriangle, color: stats!.openFraudAlerts > 0 ? 'text-red-600' : 'text-emerald-600', bg: stats!.openFraudAlerts > 0 ? 'bg-red-50' : 'bg-emerald-50' },
              { title: 'Total Spend', value: `${stats!.currency} ${(stats!.totalSpend / 1000).toFixed(1)}K`, sub: `across ${stats!.totalInvoices} invoices`, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map((s) => {
              const Icon = s.icon
              return (
                <Card key={s.title}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{s.title}</p>
                        <p className="text-2xl font-bold">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.sub}</p>
                      </div>
                      <div className={`p-2.5 rounded-xl ${s.bg}`}>
                        <Icon className={`w-5 h-5 ${s.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Row 2: AI Analysis Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* OCR Confidence */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Eye className="w-4 h-4" /> OCR Confidence
                </div>
                <p className="text-2xl font-bold">{cards.ocrConfidence}%</p>
                <Progress value={cards.ocrConfidence} className="h-1.5 mt-2" />
              </CardContent>
            </Card>

            {/* Validation */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <CheckCircle2 className="w-4 h-4" /> Validation
                </div>
                <p className="text-2xl font-bold">{cards.validationStatus.passRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cards.validationStatus.passed} passed, {cards.validationStatus.failed} flagged
                </p>
              </CardContent>
            </Card>

            {/* Compliance Score */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <ShieldCheck className="w-4 h-4" /> Compliance
                </div>
                <p className={`text-2xl font-bold ${cards.complianceScore >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {cards.complianceScore}%
                </p>
                <Progress value={cards.complianceScore} className="h-1.5 mt-2" />
              </CardContent>
            </Card>

            {/* Vendor Reliability */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Users className="w-4 h-4" /> Vendor Reliability
                </div>
                <p className={`text-2xl font-bold ${cards.vendorReliability >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {cards.vendorReliability}%
                </p>
                <Progress value={cards.vendorReliability} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Match + Risk + Price + Recommendation */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Match Stats */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <GitCompareArrows className="w-4 h-4" /> 3-Way Match
                </div>
                <div className="flex gap-1 mt-1">
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs">{cards.matchStats.matched} matched</Badge>
                  <Badge className="bg-amber-100 text-amber-700 text-xs">{cards.matchStats.partial} partial</Badge>
                  <Badge className="bg-red-100 text-red-700 text-xs">{cards.matchStats.mismatched} failed</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Avg confidence: {cards.matchStats.avgConfidence}%
                </p>
              </CardContent>
            </Card>

            {/* Risk Score */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <BarChart3 className="w-4 h-4" /> Risk Score
                </div>
                <p className="text-2xl font-bold">{cards.riskScore.average}</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-emerald-600">{cards.riskScore.low} Low</span>
                  <span className="text-amber-600">{cards.riskScore.medium} Med</span>
                  <span className="text-red-600">{cards.riskScore.high} High</span>
                </div>
              </CardContent>
            </Card>

            {/* Price Intelligence */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  {cards.priceDifference.avgChange > 0
                    ? <ArrowUpRight className="w-4 h-4 text-red-500" />
                    : <ArrowDownRight className="w-4 h-4 text-emerald-500" />}
                  Price Intelligence
                </div>
                <p className={`text-2xl font-bold ${cards.priceDifference.avgChange > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {cards.priceDifference.avgChange > 0 ? '+' : ''}{cards.priceDifference.avgChange}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  avg change across {cards.priceDifference.itemsAnalyzed} items
                </p>
              </CardContent>
            </Card>

            {/* Recommended Action */}
            <Card className={`border ${actionBg}`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <ThumbsUp className="w-4 h-4" /> Recommended Action
                </div>
                <p className={`text-xl font-bold ${actionColor}`}>{cards.recommendedAction}</p>
                <div className="flex gap-1 mt-2">
                  <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]">{cards.actionBreakdown.approve} Approve</Badge>
                  <Badge variant="outline" className="text-amber-600 border-amber-200 text-[10px]">{cards.actionBreakdown.review} Review</Badge>
                  <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]">{cards.actionBreakdown.reject} Reject</Badge>
                </div>
                {cards.potentialSavings > 0 && (
                  <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    Potential savings: {stats!.currency} {cards.potentialSavings.toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
                <CardDescription>Latest procurement actions and AI alerts</CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                {activity.length > 0 ? (
                  <div className="space-y-1">
                    {activity.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            item.type === 'fraud' ? 'bg-red-500' : item.type === 'match' ? 'bg-emerald-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-sm truncate">{item.action}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-4">{item.time}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Upload Document', icon: FileText, tab: 'documents' as const, desc: 'Invoice, PO, GRN, Contract' },
                  { label: '3-Way Match', icon: GitCompareArrows, tab: 'matching' as const, desc: 'PO vs GRN vs Invoice' },
                  { label: 'Fraud Alerts', icon: AlertTriangle, tab: 'fraud-alerts' as const, desc: 'Scan for anomalies' },
                  { label: 'Vendor Insights', icon: Users, tab: 'vendors' as const, desc: 'Performance & risk' },
                  { label: 'Ask AI Copilot', icon: MessageSquare, tab: 'chat' as const, desc: 'Search your documents' },
                ].map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.label}
                      onClick={() => setActiveTab(action.tab)}
                      className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 hover:border-primary/30 transition-all text-left group w-full"
                    >
                      <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-sm font-medium block">{action.label}</span>
                        <span className="text-xs text-muted-foreground">{action.desc}</span>
                      </div>
                    </button>
                  )
                })}

                <Button variant="outline" className="w-full mt-2" onClick={loadSampleData}>
                  Reset Demo Data
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}