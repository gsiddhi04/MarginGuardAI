'use client'

import { useState, useEffect } from 'react'
import {
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  FileText,
  DollarSign,
  ShieldCheck,
  BarChart3,
  Mail,
  Phone,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

interface VendorProfile {
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
  reliabilityScore: number
  complianceScore: number
  riskLevel: 'Low' | 'Medium' | 'High'
  fraudAlertCount: number
  matchResults: Array<{ status: string; confidence: number }>
  recentDocuments: Array<{ id: string; filename: string; fileType: string; amount: number; date: string }>
}

const riskColors: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
}

const fileTypeLabels: Record<string, string> = {
  invoice: 'Invoice', po: 'PO', grn: 'GRN', contract: 'Contract', quotation: 'Quote', unknown: 'Doc',
}

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${color}`}>{value}%</span>
      </div>
      <Progress value={value} className={`h-2 [&>div]:${color === 'text-emerald-600' ? 'bg-emerald-500' : color === 'text-amber-600' ? 'bg-amber-500' : 'bg-red-500'}`} />
    </div>
  )
}

export function VendorsView() {
  const [vendors, setVendors] = useState<VendorProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState<VendorProfile | null>(null)

  useEffect(() => {
    fetch('/api/vendors/insights')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setVendors(data.vendors)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalSpend = vendors.reduce((s, v) => s + v.totalSpend, 0)
  const avgReliability = vendors.length > 0 ? Math.round(vendors.reduce((s, v) => s + v.reliabilityScore, 0) / vendors.length) : 0
  const highRiskVendors = vendors.filter((v) => v.riskLevel === 'High').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Management</h1>
        <p className="text-muted-foreground mt-1">
          AI-scored vendor performance, risk assessment, and reliability tracking
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <BarChart3 className="w-5 h-5 animate-spin mr-2" /> Analyzing vendor data...
        </div>
      ) : vendors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No vendor data yet. Upload documents to see vendor insights.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Building2 className="w-4 h-4" /> Total Vendors
                </div>
                <p className="text-2xl font-bold mt-1">{vendors.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <DollarSign className="w-4 h-4" /> Total Spend
                </div>
                <p className="text-2xl font-bold mt-1">
                  {vendors[0]?.currency || 'USD'} {totalSpend.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <ShieldCheck className="w-4 h-4" /> Avg Reliability
                </div>
                <p className={`text-2xl font-bold mt-1 ${avgReliability >= 70 ? 'text-emerald-600' : avgReliability >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {avgReliability}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <AlertTriangle className="w-4 h-4" /> High Risk
                </div>
                <p className="text-2xl font-bold mt-1 text-red-600">{highRiskVendors}</p>
              </CardContent>
            </Card>
          </div>

          {/* Vendor Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vendor Directory</CardTitle>
              <CardDescription>{vendors.length} vendors found from uploaded documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Total Spend</TableHead>
                      <TableHead className="text-center">Docs</TableHead>
                      <TableHead>Reliability</TableHead>
                      <TableHead>Compliance</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead className="text-center">Alerts</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor) => (
                      <TableRow key={vendor.name}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                              {vendor.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{vendor.name}</p>
                              {vendor.email && <p className="text-xs text-muted-foreground">{vendor.email}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {vendor.currency} {vendor.totalSpend.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <div className="flex items-center justify-center gap-1">
                            <FileText className="w-3 h-3 text-muted-foreground" />
                            {vendor.totalDocuments}
                          </div>
                          <div className="flex gap-1 justify-center mt-0.5">
                            {vendor.totalInvoices > 0 && <Badge variant="outline" className="text-[10px] px-1">{vendor.totalInvoices} inv</Badge>}
                            {vendor.totalPOs > 0 && <Badge variant="outline" className="text-[10px] px-1">{vendor.totalPOs} PO</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-semibold ${vendor.reliabilityScore >= 70 ? 'text-emerald-600' : vendor.reliabilityScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {vendor.reliabilityScore}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-semibold ${vendor.complianceScore >= 80 ? 'text-emerald-600' : vendor.complianceScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {vendor.complianceScore}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={riskColors[vendor.riskLevel]}>{vendor.riskLevel}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {vendor.fraudAlertCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600 text-sm font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {vendor.fraudAlertCount}
                            </span>
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedVendor(vendor)}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Vendor Detail Dialog */}
      <Dialog open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {selectedVendor?.name.charAt(0)}
              </div>
              <div>
                {selectedVendor?.name}
                <Badge className={`ml-2 ${riskColors[selectedVendor?.riskLevel || 'Low']}`}>
                  {selectedVendor?.riskLevel} Risk
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedVendor && (
            <div className="space-y-4">
              {/* Contact */}
              <div className="flex gap-4 text-sm text-muted-foreground">
                {selectedVendor.email && (
                  <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedVendor.email}</span>
                )}
                {selectedVendor.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedVendor.phone}</span>
                )}
              </div>

              <Separator />

              {/* Scores */}
              <div className="grid grid-cols-2 gap-4">
                <ScoreBar value={selectedVendor.reliabilityScore} label="Reliability" color={selectedVendor.reliabilityScore >= 70 ? 'text-emerald-600' : 'text-amber-600'} />
                <ScoreBar value={selectedVendor.complianceScore} label="Compliance" color={selectedVendor.complianceScore >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Total Spend</div>
                  <div className="text-lg font-bold">{selectedVendor.currency} {selectedVendor.totalSpend.toLocaleString()}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Avg Order</div>
                  <div className="text-lg font-bold">{selectedVendor.currency} {selectedVendor.averageOrderValue.toLocaleString()}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Documents</div>
                  <div className="text-lg font-bold">{selectedVendor.totalDocuments}</div>
                </div>
              </div>

              {/* Document type breakdown */}
              <div className="flex gap-2">
                {selectedVendor.totalInvoices > 0 && <Badge variant="outline">{selectedVendor.totalInvoices} Invoice(s)</Badge>}
                {selectedVendor.totalPOs > 0 && <Badge variant="outline">{selectedVendor.totalPOs} PO(s)</Badge>}
                {selectedVendor.totalGRNs > 0 && <Badge variant="outline">{selectedVendor.totalGRNs} GRN(s)</Badge>}
                {selectedVendor.totalContracts > 0 && <Badge variant="outline">{selectedVendor.totalContracts} Contract(s)</Badge>}
              </div>

              {/* Price Range */}
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" /> Order Value Range
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Low: {selectedVendor.currency} {selectedVendor.lowestOrder.toLocaleString()}</span>
                  <span className="font-medium">{selectedVendor.currency} {selectedVendor.averageOrderValue.toLocaleString()} avg</span>
                  <span>High: {selectedVendor.currency} {selectedVendor.highestOrder.toLocaleString()}</span>
                </div>
              </div>

              {/* Match Results */}
              {selectedVendor.matchResults.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold mb-2">Three-Way Match History</div>
                  <div className="space-y-1">
                    {selectedVendor.matchResults.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-1 ${m.status === 'matched' ? 'text-emerald-600' : m.status === 'partial_match' ? 'text-amber-600' : 'text-red-600'}`}>
                          {m.status === 'matched' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          {m.status.replace('_', ' ')}
                        </span>
                        <span className="text-muted-foreground">{m.confidence}% confidence</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Documents */}
              {selectedVendor.recentDocuments.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold mb-2">Recent Documents</div>
                  <div className="space-y-1">
                    {selectedVendor.recentDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <Badge variant="outline" className="text-[10px]">{fileTypeLabels[doc.fileType] || doc.fileType}</Badge>
                          {doc.filename}
                        </span>
                        <span className="text-muted-foreground">{doc.amount > 0 ? `${doc.currency} ${doc.amount.toLocaleString()}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fraud Summary */}
              {selectedVendor.fraudAlertCount > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                  <div className="text-xs font-semibold text-red-700 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                    {selectedVendor.fraudAlertCount} Fraud Alert(s)
                  </div>
                  <p className="text-xs text-red-600">This vendor has triggered fraud detection rules. Review alerts in the Fraud Alerts tab.</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}