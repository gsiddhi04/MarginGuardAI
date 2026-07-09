'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  FileText,
  Upload,
  Eye,
  Loader2,
  FileSpreadsheet,
  FileType,
  ImageIcon,
  Building2,
  Calendar,
  DollarSign,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Link2,
  Sparkles,
  ArrowRight,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/stores/app-store'
import { toast } from 'sonner'

// ===== TYPES =====

interface ExtractedData {
  vendorName?: string
  vendorEmail?: string
  vendorPhone?: string
  documentNumber?: string
  documentDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  subtotalAmount?: number
  currency?: string
  items?: Array<{ description: string; quantity: number; unitPrice: number; total: number }>
}

interface ValidationIssue {
  field: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

interface UploadAnalysis {
  validation: { passed: boolean; score: number; issues: ValidationIssue[] }
  risk: { score: number; level: string; factors: string[] }
  match: { status: string; confidence: number; discrepancies: number } | null
  fraudAlerts: Array<{ severity: string; alertType: string; description: string; recommendation: string }> | null
  linkedDocuments: string[] | null
  aiSummary: string
  recommendation: { action: string; reason: string; nextSteps: string[] }
}

interface UploadResult {
  success: boolean
  filename: string
  error?: string
  document?: {
    id: string
    filename: string
    fileType: string
    status: string
    amount: number
    currency: string
    documentDate: string | null
    extractedTextLength: number
    extractionConfidence: number
    extractedData: ExtractedData | null
    fileSize: string
    createdAt: string
  }
  analysis?: UploadAnalysis
}

interface DocumentItem {
  id: string
  filename: string
  fileType: string
  status: string
  amount: number
  currency: string
  riskScore: number | null
  documentDate: string | null
  createdAt: string
  extractedTextLength: number
  extractedData?: ExtractedData | null
}

// ===== CONSTANTS =====

const fileTypeColors: Record<string, string> = {
  invoice: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  po: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  grn: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  contract: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  quotation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
}

const fileTypeLabels: Record<string, string> = {
  invoice: 'Invoice',
  po: 'Purchase Order',
  grn: 'GRN',
  contract: 'Contract',
  quotation: 'Quotation',
  unknown: 'Unknown',
}

const statusColors: Record<string, string> = {
  uploaded: 'bg-yellow-100 text-yellow-700',
  processed: 'bg-emerald-100 text-emerald-700',
  flagged: 'bg-red-100 text-red-700',
  approved: 'bg-blue-100 text-blue-700',
}

const actionColors: Record<string, string> = {
  Approve: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Review: 'bg-amber-100 text-amber-700 border-amber-200',
  Reject: 'bg-red-100 text-red-700 border-red-200',
  Escalate: 'bg-purple-100 text-purple-700 border-purple-200',
}

const riskColors: Record<string, string> = {
  Low: 'text-emerald-600',
  Medium: 'text-amber-600',
  High: 'text-red-600',
}

const riskBgColors: Record<string, string> = {
  Low: 'bg-emerald-50 border-emerald-200',
  Medium: 'bg-amber-50 border-amber-200',
  High: 'bg-red-50 border-red-200',
}

// ===== HELPERS =====

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return <FileType className="w-5 h-5 text-red-500" />
  if (['docx', 'doc'].includes(ext || '')) return <FileSpreadsheet className="w-5 h-5 text-blue-500" />
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) return <ImageIcon className="w-5 h-5 text-emerald-500" />
  return <FileText className="w-5 h-5 text-gray-500" />
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
  const bgColor = score >= 75 ? 'bg-emerald-50' : score >= 50 ? 'bg-amber-50' : 'bg-red-50'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color} ${bgColor}`}>
      <BarChart3 className="w-3 h-3" />
      {score}%
    </span>
  )
}

// ===== RESULT CARD =====

function ResultCard({ result, index }: { result: UploadResult; index: number }) {
  const [expanded, setExpanded] = useState(index === 0) // expand first by default
  if (!result.success) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-3 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">{result.filename}</p>
            <p className="text-xs text-red-500">{result.error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const doc = result.document!
  const analysis = result.analysis!

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {getFileIcon(doc.filename)}
          <div>
            <p className="font-medium text-sm">{doc.filename}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${fileTypeColors[doc.fileType]}`}>
                {fileTypeLabels[doc.fileType]}
              </span>
              {doc.extractedData?.vendorName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {doc.extractedData.vendorName}
                </span>
              )}
              {doc.amount > 0 && (
                <span className="text-xs font-medium">
                  {doc.currency} {doc.amount.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Recommendation badge */}
          <Badge className={`${actionColors[analysis.recommendation.action] || ''} border text-xs font-semibold`}>
            {analysis.recommendation.action}
          </Badge>
          {/* Risk badge */}
          <span className={`text-xs font-bold ${riskColors[analysis.risk.level]}`}>
            Risk: {analysis.risk.level}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-4 pb-4 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 pt-4">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">OCR Confidence</div>
              <div className="text-lg font-bold">{doc.extractionConfidence}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">Validation</div>
              <div className="text-lg font-bold">{analysis.validation.score}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">Match</div>
              <div className="text-lg font-bold">
                {analysis.match ? `${analysis.match.confidence}%` : 'N/A'}
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">Risk Score</div>
              <div className={`text-lg font-bold ${riskColors[analysis.risk.level]}`}>{analysis.risk.score}</div>
            </div>
          </div>

          {/* AI Summary */}
          <div className="rounded-lg border p-3 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> AI Summary
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{analysis.aiSummary}</p>
          </div>

          {/* Recommendation */}
          <div className={`rounded-lg border p-3 ${riskBgColors[analysis.risk.level]}`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Recommendation: {analysis.recommendation.action}
            </div>
            <p className="text-sm mb-2">{analysis.recommendation.reason}</p>
            <ul className="text-xs space-y-1">
              {analysis.recommendation.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Linked Documents */}
          {analysis.linkedDocuments && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                <Link2 className="w-3.5 h-3.5" /> Linked Documents
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.linkedDocuments.map((doc, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{doc}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Match Result */}
          {analysis.match && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Three-Way Match
                </span>
                <span className={`text-xs font-medium ${
                  analysis.match.status === 'matched' ? 'text-emerald-600' :
                  analysis.match.status === 'partial_match' ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {analysis.match.status.replace('_', ' ').toUpperCase()} — {analysis.match.confidence}%
                </span>
              </div>
              {analysis.match.discrepancies > 0 && (
                <p className="text-xs text-muted-foreground">
                  {analysis.match.discrepancies} discrepancy(ies) found
                </p>
              )}
            </div>
          )}

          {/* Fraud Alerts */}
          {analysis.fraudAlerts && analysis.fraudAlerts.length > 0 && (
            <div className="rounded-lg border border-red-200 p-3 bg-red-50/50">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Fraud Alerts ({analysis.fraudAlerts.length})
              </div>
              <ul className="text-xs space-y-1.5">
                {analysis.fraudAlerts.map((alert, i) => (
                  <li key={i} className="text-red-600">
                    <Badge variant="outline" className="text-[10px] mr-1 border-red-300">{alert.severity}</Badge>
                    {alert.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation Issues */}
          {analysis.validation.issues.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold mb-1.5">Validation ({analysis.validation.issues.length} issue(s))</div>
              <ul className="text-xs space-y-1">
                {analysis.validation.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {issue.severity === 'error' ? <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" /> :
                     issue.severity === 'warning' ? <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> :
                     <CheckCircle2 className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />}
                    <span className="font-medium">{issue.field}:</span> <span className="text-muted-foreground">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Factors */}
          {analysis.risk.factors.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold mb-1.5">Risk Factors</div>
              <ul className="text-xs space-y-1">
                {analysis.risk.factors.map((factor, i) => (
                  <li key={i} className="text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ===== MAIN VIEW =====

export function DocumentsView() {
  const { setDocumentCount } = useAppStore()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null)
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      if (data.success) {
        setDocuments(data.documents)
        setDocumentCount(data.documents.length)
      }
    } catch {
      // silently fail
    }
  }, [setDocumentCount])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const uploadFiles = async (files: File[]) => {
    setUploading(true)
    setUploadResults([])

    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (data.results) {
        setUploadResults(data.results)
        const succeeded = data.results.filter((r: UploadResult) => r.success).length
        const failed = data.results.length - succeeded
        if (failed === 0) {
          toast.success(`${succeeded} document(s) processed successfully`)
        } else {
          toast.warning(`${succeeded} processed, ${failed} failed`)
        }
      } else if (data.success) {
        toast.success(`"${files[0].name}" processed successfully`)
      } else {
        toast.error(data.error || 'Upload failed')
      }

      fetchDocuments()
    } catch {
      toast.error('Failed to upload files')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) uploadFiles(files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const clearAllDocuments = async () => {
    if (!confirm('Delete ALL documents, matches, fraud alerts, and chat history? This cannot be undone.')) return
    try {
      const res = await fetch('/api/documents', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('All documents cleared')
        setUploadResults([])
        fetchDocuments()
      } else {
        toast.error(data.error || 'Failed to clear')
      }
    } catch {
      toast.error('Failed to clear documents')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Upload procurement documents — invoices, POs, GRNs, contracts. Upload multiple files at once for auto-matching.
        </p>
      </div>

      {/* Upload Zone */}
      <Card
        className={`border-dashed border-2 transition-all cursor-pointer ${
          dragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'hover:border-primary/50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 relative">
          {uploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Processing documents — OCR, classification, matching &amp; analysis...</p>
              </div>
            </div>
          )}
          <div className="p-4 rounded-full bg-primary/10 mb-4">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <p className="font-medium">Drop files here or click to upload</p>
          <p className="text-sm text-muted-foreground mt-1">
            Supports PDF, DOCX, images — multiple files at once. AI auto-detects type, extracts data, validates, matches &amp; analyzes.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Max 20MB per file</p>
        </CardContent>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.txt,.csv"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </Card>

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Analysis Results
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setUploadResults([])}>
              Clear
            </Button>
          </div>
          {uploadResults.map((result, i) => (
            <ResultCard key={i} result={result} index={i} />
          ))}
        </div>
      )}

      {/* Documents Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">All Documents</CardTitle>
              <CardDescription>{documents.length} documents processed</CardDescription>
            </div>
            {documents.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchDocuments}>
                  Refresh
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={clearAllDocuments}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No documents yet. Upload your first procurement document above.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{getFileIcon(doc.filename)}</TableCell>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {doc.filename}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${fileTypeColors[doc.fileType] || fileTypeColors.unknown}`}>
                          {fileTypeLabels[doc.fileType] || doc.fileType}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.extractedData?.vendorName ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="max-w-[140px] truncate">{doc.extractedData.vendorName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {doc.amount > 0 ? (
                          <span>{doc.currency} {doc.amount.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge score={doc.extractedData?.confidence || 0} />
                      </TableCell>
                      <TableCell>
                        {doc.riskScore !== null && doc.riskScore !== undefined ? (
                          <span className={`text-xs font-bold ${doc.riskScore >= 60 ? 'text-red-600' : doc.riskScore >= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {doc.riskScore >= 60 ? 'High' : doc.riskScore >= 30 ? 'Med' : 'Low'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewDoc(doc)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview / Detail Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewDoc && getFileIcon(previewDoc.filename)}
              {previewDoc?.filename}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && previewDoc.extractedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={fileTypeColors[previewDoc.fileType]}>
                  {fileTypeLabels[previewDoc.fileType]}
                </Badge>
                <Badge variant="outline">
                  {previewDoc.extractedTextLength.toLocaleString()} chars extracted
                </Badge>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[previewDoc.status]}`}>
                  {previewDoc.status}
                </span>
                {previewDoc.riskScore !== null && previewDoc.riskScore !== undefined && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${riskColors[previewDoc.riskScore >= 60 ? 'High' : previewDoc.riskScore >= 30 ? 'Medium' : 'Low']}`}>
                    Risk: {previewDoc.riskScore >= 60 ? 'High' : previewDoc.riskScore >= 30 ? 'Medium' : 'Low'} ({previewDoc.riskScore})
                  </span>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="w-3.5 h-3.5" /> Vendor
                  </div>
                  <p className="text-sm font-medium">{previewDoc.extractedData.vendorName || 'Not detected'}</p>
                  {previewDoc.extractedData.vendorEmail && (
                    <p className="text-xs text-muted-foreground">{previewDoc.extractedData.vendorEmail}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="w-3.5 h-3.5" /> Document #
                  </div>
                  <p className="text-sm font-medium">{previewDoc.extractedData.documentNumber || 'Not detected'}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" /> Date
                  </div>
                  <p className="text-sm font-medium">{previewDoc.extractedData.documentDate || 'Not detected'}</p>
                  {previewDoc.extractedData.dueDate && (
                    <p className="text-xs text-muted-foreground">Due: {previewDoc.extractedData.dueDate}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DollarSign className="w-3.5 h-3.5" /> Amount
                  </div>
                  <p className="text-sm font-bold text-lg">
                    {previewDoc.currency} {previewDoc.amount.toLocaleString()}
                  </p>
                  {previewDoc.extractedData.taxAmount ? (
                    <p className="text-xs text-muted-foreground">
                      Tax: {previewDoc.currency} {previewDoc.extractedData.taxAmount.toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </div>

              {previewDoc.extractedData.items && previewDoc.extractedData.items.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      Line Items ({previewDoc.extractedData.items.length})
                    </h4>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewDoc.extractedData.items.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">{item.description}</TableCell>
                              <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-right text-sm">
                                {previewDoc.currency} {item.unitPrice.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {previewDoc.currency} {item.total.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {previewDoc && !previewDoc.extractedData && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No extraction data available.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}