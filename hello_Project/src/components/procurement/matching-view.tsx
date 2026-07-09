'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  GitCompareArrows,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  FileUp,
  RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ===== TYPES =====

interface DocumentOption {
  id: string
  filename: string
  fileType: string
  amount: number
  currency: string
  vendorName?: string
  documentNumber?: string
}

interface LineItemMatch {
  description: string
  poQty: number | null
  grnQty: number | null
  invQty: number | null
  poPrice: number | null
  grnPrice: number | null
  invPrice: number | null
  poTotal: number | null
  grnTotal: number | null
  invTotal: number | null
  status: string
  issues: string[]
}

interface Discrepancy {
  field: string
  description: string
  poValue: string
  grnValue: string
  invoiceValue: string
  severity: string
}

interface MatchResult {
  matchStatus: string
  confidenceScore: number
  discrepancies: Discrepancy[]
  lineItemComparison: LineItemMatch[]
  summary: string
}

// ===== COMPONENT =====

type DocSlot = 'po' | 'grn' | 'invoice'

const slotConfig: Record<DocSlot, { label: string; color: string; bgColor: string; description: string }> = {
  po: { label: 'Purchase Order', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200', description: 'Upload or select a PO' },
  grn: { label: 'Goods Receipt Note', color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200', description: 'Upload or select a GRN' },
  invoice: { label: 'Invoice', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200', description: 'Upload or select an Invoice' },
}

export function MatchingView() {
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [selected, setSelected] = useState<Record<DocSlot, string | null>>({ po: null, grn: null, invoice: null })
  const [matching, setMatching] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      if (data.success) {
        setDocuments(
          data.documents.map((d: DocumentOption & { extractedData?: { vendorName?: string; documentNumber?: string } }) => ({
            ...d,
            vendorName: d.extractedData?.vendorName,
            documentNumber: d.extractedData?.documentNumber,
          }))
        )
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleMatch = async () => {
    const docsProvided = Object.values(selected).filter(Boolean).length
    if (docsProvided < 2) {
      toast.error('Select at least 2 documents to match')
      return
    }

    setMatching(true)
    setResult(null)

    try {
      const res = await fetch('/api/matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po: selected.po ? { type: 'documentId', value: selected.po } : null,
          grn: selected.grn ? { type: 'documentId', value: selected.grn } : null,
          invoice: selected.invoice ? { type: 'documentId', value: selected.invoice } : null,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setResult(data)
        toast.success(`Match complete: ${data.matchStatus.replace('_', ' ')} (${data.confidenceScore}% confidence)`)
      } else {
        toast.error(data.error || 'Matching failed')
      }
    } catch {
      toast.error('Failed to run matching')
    } finally {
      setMatching(false)
    }
  }

  const reset = () => {
    setSelected({ po: null, grn: null, invoice: null })
    setResult(null)
  }

  const getDocLabel = (id: string) => {
    const doc = documents.find((d) => d.id === id)
    return doc ? doc.filename : id
  }

  const statusIcon = (status: string) => {
    if (status === 'matched') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />
    if (status === 'partial_match') return <AlertTriangle className="w-5 h-5 text-amber-500" />
    return <XCircle className="w-5 h-5 text-red-500" />
  }

  const statusColor = (status: string) => {
    if (status === 'matched') return 'text-emerald-600 bg-emerald-50'
    if (status === 'partial_match') return 'text-amber-600 bg-amber-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Three-Way Matching</h1>
        <p className="text-muted-foreground mt-1">
          AI-powered PO ↔ GRN ↔ Invoice reconciliation — auto-detect discrepancies
        </p>
      </div>

      {/* Document Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['po', 'grn', 'invoice'] as DocSlot[]).map((slot) => {
          const config = slotConfig[slot]
          const selectedDocId = selected[slot]
          const selectedDoc = selectedDocId ? documents.find((d) => d.id === selectedDocId) : null

          // Filter documents by type for suggestions
          const suggestedDocs = documents.filter((d) => {
            if (slot === 'po') return d.fileType === 'po' || d.fileType === 'quotation'
            if (slot === 'grn') return d.fileType === 'grn'
            if (slot === 'invoice') return d.fileType === 'invoice'
            return true
          })

          return (
            <Card key={slot} className={`border-2 transition-all ${selectedDocId ? config.bgColor : 'border-dashed'}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${config.color}`}>
                  {selectedDocId ? <CheckCircle2 className="w-4 h-4" /> : <FileUp className="w-4 h-4" />}
                  {config.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDoc ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium truncate">{selectedDoc.filename}</p>
                    {selectedDoc.vendorName && (
                      <p className="text-xs text-muted-foreground">{selectedDoc.vendorName}</p>
                    )}
                    {selectedDoc.amount > 0 && (
                      <p className="text-sm font-bold">{selectedDoc.currency} {selectedDoc.amount.toLocaleString()}</p>
                    )}
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setSelected({ ...selected, [slot]: null })}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                    {suggestedDocs.length > 0 ? (
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {suggestedDocs.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => setSelected({ ...selected, [slot]: doc.id })}
                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 border transition-colors truncate"
                          >
                            {doc.filename}
                            {doc.amount > 0 && ` — ${doc.currency} ${doc.amount.toLocaleString()}`}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No matching documents. Upload documents first.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button onClick={handleMatch} disabled={matching || Object.values(selected).filter(Boolean).length < 2} className="gap-2">
          {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
          {matching ? 'Matching...' : 'Run Three-Way Match'}
        </Button>
        <Button variant="outline" onClick={reset} className="gap-2">
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Match Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon(result.matchStatus)}
                  <div>
                    <CardTitle className="text-base">
                      {result.matchStatus === 'matched' ? 'Documents Match' : result.matchStatus === 'partial_match' ? 'Partial Match — Discrepancies Found' : 'Mismatch — Significant Discrepancies'}
                    </CardTitle>
                    <CardDescription>Three-way reconciliation result</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{result.confidenceScore}%</div>
                  <div className="text-xs text-muted-foreground">Confidence</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={result.confidenceScore} className="h-2 mb-4" />

              {result.discrepancies.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Discrepancies ({result.discrepancies.length})</h4>
                  {result.discrepancies.map((d, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                      <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${d.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{d.field}</p>
                        <p className="text-xs text-muted-foreground">{d.description}</p>
                        <div className="flex gap-3 mt-1 text-xs">
                          <span>PO: {d.poValue}</span>
                          <span>GRN: {d.grnValue}</span>
                          <span>Inv: {d.invoiceValue}</span>
                        </div>
                      </div>
                      <Badge variant={d.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                        {d.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-emerald-600 font-medium">All checks passed. Documents are consistent.</p>
              )}
            </CardContent>
          </Card>

          {/* Line Item Comparison Table */}
          {result.lineItemComparison.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Line Item Comparison ({result.lineItemComparison.length} items)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">PO Qty</TableHead>
                        <TableHead className="text-right">GRN Qty</TableHead>
                        <TableHead className="text-right">Inv Qty</TableHead>
                        <TableHead className="text-right">PO Total</TableHead>
                        <TableHead className="text-right">GRN Total</TableHead>
                        <TableHead className="text-right">Inv Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.lineItemComparison.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge variant={
                              item.status === 'matched' ? 'outline' :
                              item.status === 'mismatch' ? 'destructive' : 'secondary'
                            } className="text-[10px]">
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            <div>{item.description}</div>
                            {item.issues.length > 0 && (
                              <p className="text-xs text-red-500 mt-0.5">{item.issues[0]}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">{item.poQty ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.grnQty ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.invQty ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.poTotal?.toLocaleString() ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.grnTotal?.toLocaleString() ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.invTotal?.toLocaleString() ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}