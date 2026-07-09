import mammoth from 'mammoth'

/**
 * Extract text from PDF using pdf-parse (fully offline, no API needed)
 */
async function extractFromPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdfParseModule = await import('pdf-parse')
    const { PDFParse } = pdfParseModule
    if (PDFParse) {
      const parser = new PDFParse({})
      await parser.load(Buffer.from(buffer))
      const text = await parser.getText()
      return text || ''
    }
    throw new Error('PDFParse class not found in pdf-parse module')
  } catch (error) {
    console.error('PDF extraction error:', error)
    return ''
  }
}

/**
 * Extract text from DOCX using mammoth (fully offline)
 */
async function extractFromDOCX(buffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return result.value || ''
  } catch (error) {
    console.error('DOCX extraction error:', error)
    return ''
  }
}

/**
 * Extract text from images using Tesseract.js (offline after initial model download)
 */
async function extractFromImage(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  try {
    // Dynamic import to avoid loading Tesseract unless needed
    const Tesseract = await import('tesseract.js')
    const result = await Tesseract.default.recognize(Buffer.from(buffer), 'eng', {
      logger: () => {}, // suppress progress logs
    })
    return result.data.text || ''
  } catch (error) {
    console.error('Image OCR error:', error)
    return ''
  }
}

/**
 * Main extraction function — auto-detects file type and extracts text
 * Works fully offline for PDF, DOCX, and images
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const mimeType = file.type || ''
  const name = file.name.toLowerCase()

  // PDF
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    return extractFromPDF(buffer)
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return extractFromDOCX(buffer)
  }

  // Images (png, jpg, jpeg, webp, bmp, tiff)
  if (
    mimeType.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.bmp') ||
    name.endsWith('.tiff')
  ) {
    return extractFromImage(buffer, mimeType)
  }

  // Plain text files
  if (mimeType === 'text/plain' || name.endsWith('.txt') || name.endsWith('.csv')) {
    return buffer.toString()
  }

  return ''
}

/**
 * Classify document type based on filename and extracted text content
 */
export function classifyDocument(filename: string, text: string): 'invoice' | 'po' | 'grn' | 'contract' | 'quotation' | 'unknown' {
  const lower = (filename + ' ' + text.substring(0, 2000)).toLowerCase()

  // Score-based classification
  const scores: Record<string, number> = {
    invoice: 0,
    po: 0,
    grn: 0,
    contract: 0,
    quotation: 0,
  }

  // Invoice signals
  if (lower.includes('invoice') || lower.includes('inv-') || lower.includes('bill to') || lower.includes('invoice no') || lower.includes('invoice number')) scores.invoice += 3
  if (lower.includes('tax') || lower.includes('gst') || lower.includes('subtotal') || lower.includes('total amount') || lower.includes('amount due')) scores.invoice += 2
  if (lower.includes('due date') || lower.includes('payment terms') || lower.includes('remit to')) scores.invoice += 1

  // PO signals
  if (lower.includes('purchase order') || lower.includes('po number') || lower.includes('po no') || lower.includes('po-')) scores.po += 3
  if (lower.includes('ship to') || lower.includes('delivery address') || lower.includes('ordered by')) scores.po += 2
  if (lower.includes('order date') || lower.includes('expected delivery') || lower.includes('delivery date')) scores.po += 1

  // GRN signals
  if (lower.includes('goods receipt') || lower.includes('grn') || lower.includes('received on') || lower.includes('delivery note')) scores.grn += 3
  if (lower.includes('received quantity') || lower.includes('accepted') || lower.includes('rejected') || lower.includes('damaged')) scores.grn += 2
  if (lower.includes('challan') || lower.includes('lr number') || lower.includes('vehicle no')) scores.grn += 1

  // Contract signals
  if (lower.includes('contract') || lower.includes('agreement') || lower.includes('terms and conditions') || lower.includes('hereby')) scores.contract += 3
  if (lower.includes('party') || lower.includes('whereas') || lower.includes('witness') || lower.includes('signatures') || lower.includes('effective date')) scores.contract += 2
  if (lower.includes('termination') || lower.includes('liability') || lower.includes('indemnity') || lower.includes('governing law')) scores.contract += 1

  // Quotation signals
  if (lower.includes('quotation') || lower.includes('quote') || lower.includes('rfq') || lower.includes('proposal')) scores.quotation += 3
  if (lower.includes('valid until') || lower.includes('offer valid') || lower.includes('quoted price') || lower.includes('unit rate')) scores.quotation += 2

  // Find highest score
  let bestType = 'unknown' as const
  let bestScore = 2 // minimum threshold

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestType = type as typeof bestType
    }
  }

  return bestType
}

/** Helper to get file extension */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

/** Helper to format file size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}