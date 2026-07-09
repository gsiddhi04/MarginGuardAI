/**
 * Sample Data Seeder
 * Run: POST /api/seed
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const SAMPLE_DOCUMENTS = [
  {
    filename: 'INV-2024-0891_BuildMax_Supplies.pdf',
    fileType: 'invoice',
    extractedText: 'INVOICE NO: INV-2024-0891\nDate: 15 June 2024\nFrom: BuildMax Supplies Pvt Ltd\n42 Industrial Area, Sector 7, New Delhi\nPhone: +91-9876543210\nEmail: accounts@buildmax.com\n\nBill To: Skyline Construction Corp\nPlot 45, MIDC Road, Mumbai\n\nSL.NO  DESCRIPTION                        QTY   RATE         TOTAL\n1       Cement OPC 43 Grade (50kg bags) 500   380.00       190,000.00\n2       TMT Steel Bars 12mm (per ton)   25    52,500.00    1,312,500.00\n3       Sand River (per cubic meter)    100   1,200.00     120,000.00\n4       Aggregate 20mm (per cum)         80    1,450.00     116,000.00\n\nSubtotal: 1,738,500.00\nGST (18%): 312,930.00\nGRAND TOTAL: 2,051,430.00\n\nPayment Terms: Net 30 days\nDue Date: 15 July 2024',
    extractedData: JSON.stringify({ vendorName: 'BuildMax Supplies Pvt Ltd', vendorEmail: 'accounts@buildmax.com', vendorPhone: '+91-9876543210', documentNumber: 'INV-2024-0891', documentDate: '15 June 2024', dueDate: '15 July 2024', items: [{ description: 'Cement OPC 43 Grade (50kg bags)', quantity: 500, unitPrice: 380, total: 190000 },{ description: 'TMT Steel Bars 12mm (per ton)', quantity: 25, unitPrice: 52500, total: 1312500 },{ description: 'Sand River (per cubic meter)', quantity: 100, unitPrice: 1200, total: 120000 },{ description: 'Aggregate 20mm (per cum)', quantity: 80, unitPrice: 1450, total: 116000 }], totalAmount: 2051430, taxAmount: 312930, subtotalAmount: 1738500, currency: 'INR', confidence: 95 }),
    status: 'processed', amount: 2051430, currency: 'INR', documentDate: '15 June 2024',
  },
  {
    filename: 'INV-2024-0892_BuildMax_Supplies.pdf',
    fileType: 'invoice',
    extractedText: 'INVOICE NO: INV-2024-0892\nDate: 20 June 2024\nFrom: BuildMax Supplies Pvt Ltd\n42 Industrial Area, Sector 7, New Delhi\nPhone: +91-9876543210\nEmail: accounts@buildmax.com\n\nBill To: Skyline Construction Corp\nPlot 45, MIDC Road, Mumbai\n\nSL.NO  DESCRIPTION                        QTY   RATE         TOTAL\n1       Cement OPC 43 Grade (50kg bags) 500   380.00       190,000.00\n2       TMT Steel Bars 12mm (per ton)   25    52,500.00    1,312,500.00\n3       Sand River (per cubic meter)    100   1,200.00     120,000.00\n4       Aggregate 20mm (per cum)         80    1,450.00     116,000.00\n\nSubtotal: 1,738,500.00\nGST (18%): 312,930.00\nGRAND TOTAL: 2,051,430.00\n\nPayment Terms: Net 30 days\nDue Date: 20 July 2024',
    extractedData: JSON.stringify({ vendorName: 'BuildMax Supplies Pvt Ltd', vendorEmail: 'accounts@buildmax.com', vendorPhone: '+91-9876543210', documentNumber: 'INV-2024-0892', documentDate: '20 June 2024', dueDate: '20 July 2024', items: [{ description: 'Cement OPC 43 Grade (50kg bags)', quantity: 500, unitPrice: 380, total: 190000 },{ description: 'TMT Steel Bars 12mm (per ton)', quantity: 25, unitPrice: 52500, total: 1312500 },{ description: 'Sand River (per cubic meter)', quantity: 100, unitPrice: 1200, total: 120000 },{ description: 'Aggregate 20mm (per cum)', quantity: 80, unitPrice: 1450, total: 116000 }], totalAmount: 2051430, taxAmount: 312930, subtotalAmount: 1738500, currency: 'INR', confidence: 95 }),
    status: 'processed', amount: 2051430, currency: 'INR', documentDate: '20 June 2024',
  },
  {
    filename: 'PO-4452_CementPro_Ltd.pdf',
    fileType: 'po',
    extractedText: 'PURCHASE ORDER NO: PO-4452\nDate: 10 June 2024\nFrom: Skyline Construction Corp\nTo: CementPro Ltd\n18 Industrial Estate, Ghaziabad, UP\n\nShip To: Site Office, Project Alpha, Navi Mumbai\n\nSL.NO  DESCRIPTION                        QTY     UNIT RATE     TOTAL\n1       OPC Cement 53 Grade (per bag)      1000    410.00        410,000.00\n2       Fly Ash (per kg)                   5000    4.50          22,500.00\n3       Waterproofing Admixture (per L)    200     185.00        37,000.00\n\nSubtotal: 469,500.00\nGST (18%): 84,510.00\nORDER TOTAL: 554,010.00\n\nExpected Delivery: 25 June 2024',
    extractedData: JSON.stringify({ vendorName: 'CementPro Ltd', vendorEmail: '', vendorPhone: '', documentNumber: 'PO-4452', documentDate: '10 June 2024', dueDate: '25 June 2024', items: [{ description: 'OPC Cement 53 Grade (per bag)', quantity: 1000, unitPrice: 410, total: 410000 },{ description: 'Fly Ash (per kg)', quantity: 5000, unitPrice: 4.5, total: 22500 },{ description: 'Waterproofing Admixture (per L)', quantity: 200, unitPrice: 185, total: 37000 }], totalAmount: 554010, taxAmount: 84510, subtotalAmount: 469500, currency: 'INR', confidence: 90 }),
    status: 'processed', amount: 554010, currency: 'INR', documentDate: '10 June 2024',
  },
  {
    filename: 'GRN-3321_CementPro.pdf',
    fileType: 'grn',
    extractedText: 'GOODS RECEIPT NOTE NO: GRN-3321\nDate: 26 June 2024\nReceived From: CementPro Ltd\nChallan No: CHL-7721\nVehicle No: MH-04-AB-1234\n\nProject: Alpha, Navi Mumbai\n\nSL.NO  DESCRIPTION                        QTY ORDERED  QTY RECEIVED  REMARKS\n1       OPC Cement 53 Grade (per bag)      1000         980           20 bags damaged\n2       Fly Ash (per kg)                   5000         5000          OK\n3       Waterproofing Admixture (per L)    200          200           OK\n\nReceived By: R. Sharma (Site Engineer)',
    extractedData: JSON.stringify({ vendorName: 'CementPro Ltd', vendorEmail: '', vendorPhone: '', documentNumber: 'GRN-3321', documentDate: '26 June 2024', items: [{ description: 'OPC Cement 53 Grade (per bag)', quantity: 980, unitPrice: 0, total: 0 },{ description: 'Fly Ash (per kg)', quantity: 5000, unitPrice: 0, total: 0 },{ description: 'Waterproofing Admixture (per L)', quantity: 200, unitPrice: 0, total: 0 }], totalAmount: 0, taxAmount: 0, subtotalAmount: 0, currency: 'INR', confidence: 75 }),
    status: 'processed', amount: 0, currency: 'INR', documentDate: '26 June 2024',
  },
  {
    filename: 'INV-2024-0895_CementPro.pdf',
    fileType: 'invoice',
    extractedText: 'INVOICE NO: INV-2024-0895\nDate: 28 June 2024\nFrom: CementPro Ltd\n18 Industrial Estate, Ghaziabad, UP\n\nBill To: Skyline Construction Corp\nPlot 45, MIDC Road, Mumbai\n\nSL.NO  DESCRIPTION                        QTY     RATE         TOTAL\n1       OPC Cement 53 Grade (per bag)      1000    470.00       470,000.00\n2       Fly Ash (per kg)                   5000    4.50         22,500.00\n3       Waterproofing Admixture (per L)    200     185.00       37,000.00\n\nSubtotal: 529,500.00\nGST (18%): 95,310.00\nGRAND TOTAL: 624,810.00\n\nDue Date: 28 July 2024',
    extractedData: JSON.stringify({ vendorName: 'CementPro Ltd', vendorEmail: '', vendorPhone: '', documentNumber: 'INV-2024-0895', documentDate: '28 June 2024', dueDate: '28 July 2024', items: [{ description: 'OPC Cement 53 Grade (per bag)', quantity: 1000, unitPrice: 470, total: 470000 },{ description: 'Fly Ash (per kg)', quantity: 5000, unitPrice: 4.5, total: 22500 },{ description: 'Waterproofing Admixture (per L)', quantity: 200, unitPrice: 185, total: 37000 }], totalAmount: 624810, taxAmount: 95310, subtotalAmount: 529500, currency: 'INR', confidence: 90 }),
    status: 'processed', amount: 624810, currency: 'INR', documentDate: '28 June 2024',
  },
  {
    filename: 'QUOT-2024-0441_SteelWorks.pdf',
    fileType: 'quotation',
    extractedText: 'QUOTATION NO: QUOT-2024-0441\nDate: 5 July 2024\nFrom: SteelWorks Inc\n55 Metal Park, Jamshedpur, Jharkhand\n\nTo: Skyline Construction Corp\n\nSL.NO  DESCRIPTION                        QTY     RATE         TOTAL\n1       Steel Plates 12mm (per ton)        50      58,000.00    2,900,000.00\n2       Steel I-Beams ISMB 250 (per ton)   30      62,000.00    1,860,000.00\n3       MS Angles 50x50x6 (per ton)        20      54,500.00    1,090,000.00\n4       Bolts and Nuts (per kg)              500     85.00        42,500.00\n\nSubtotal: 5,892,500.00\nGST (18%): 1,060,650.00\nTOTAL: 6,953,150.00\n\nValid Until: 20 July 2024',
    extractedData: JSON.stringify({ vendorName: 'SteelWorks Inc', vendorEmail: '', vendorPhone: '', documentNumber: 'QUOT-2024-0441', documentDate: '5 July 2024', items: [{ description: 'Steel Plates 12mm (per ton)', quantity: 50, unitPrice: 58000, total: 2900000 },{ description: 'Steel I-Beams ISMB 250 (per ton)', quantity: 30, unitPrice: 62000, total: 1860000 },{ description: 'MS Angles 50x50x6 (per ton)', quantity: 20, unitPrice: 54500, total: 1090000 },{ description: 'Bolts and Nuts (per kg)', quantity: 500, unitPrice: 85, total: 42500 }], totalAmount: 6953150, taxAmount: 1060650, subtotalAmount: 5892500, currency: 'INR', confidence: 90 }),
    status: 'processed', amount: 6953150, currency: 'INR', documentDate: '5 July 2024',
  },
  {
    filename: 'CONTRACT-2024-023_SteelWorks.pdf',
    fileType: 'contract',
    extractedText: 'CONTRACT NO: CTR-2024-023\nDate: 1 July 2024\n\nSUPPLY AGREEMENT\n\nBETWEEN:\nSkyline Construction Corp (Buyer)\nAND\nSteelWorks Inc (Supplier)\n\nWHEREAS the Buyer requires structural steel for Project Alpha.\n\nTERMS AND CONDITIONS:\n1. SCOPE: Supply and delivery of structural steel as per specification.\n2. DELIVERY: Within 30 days of Purchase Order.\n3. QUALITY: All materials must conform to IS 2062 Grade E250.\n4. WARRANTY: 12 months from delivery date.\n5. PAYMENT: Net 45 days from receipt of invoice and GRN.\n6. TERMINATION: Either party may terminate with 30 days written notice.\n\nGOVERNING LAW: Laws of India, Mumbai jurisdiction.',
    extractedData: JSON.stringify({ vendorName: 'SteelWorks Inc', vendorEmail: '', vendorPhone: '', documentNumber: 'CTR-2024-023', documentDate: '1 July 2024', items: [], totalAmount: 0, taxAmount: 0, subtotalAmount: 0, currency: 'INR', confidence: 80 }),
    status: 'processed', amount: 0, currency: 'INR', documentDate: '1 July 2024',
  },
]

export async function POST() {
  try {
    const existing = await db.document.count()
    if (existing > 0) {
      await db.fraudAlert.deleteMany()
      await db.threeWayMatch.deleteMany()
      await db.chatMessage.deleteMany()
      await db.document.deleteMany()
    }

    for (const doc of SAMPLE_DOCUMENTS) {
      await db.document.create({ data: doc })
    }

    const docs = await db.document.findMany()
    const po = docs.find((d) => d.filename.includes('PO-4452'))
    const grn = docs.find((d) => d.filename.includes('GRN-3321'))
    const inv = docs.find((d) => d.filename.includes('INV-2024-0895'))

    // Create a sample 3-way match (linked to documents, not PO/Invoice tables)
    if (po && grn && inv) {
      await db.threeWayMatch.create({
        data: {
          documentId: po.id,
          matchStatus: 'partial_match', confidenceScore: 72,
          discrepancies: JSON.stringify([
            { field: 'Total Amount', description: 'Invoice total (INR 624,810) is 12.8% higher than PO total (INR 554,010).', poValue: '554010', grnValue: 'N/A', invoiceValue: '624810', severity: 'high' },
            { field: 'Unit Price', description: 'Cement: PO=INR 410/bag, Invoice=INR 470/bag (14.6% increase)', poValue: '410', grnValue: 'N/A', invoiceValue: '470', severity: 'high' },
            { field: 'Line Item', description: 'Cement: GRN shows 980 bags, PO and Invoice show 1000 (20 damaged)', poValue: '1000', grnValue: '980', invoiceValue: '1000', severity: 'medium' },
          ]),
        },
      })
    }

    await db.fraudAlert.createMany({
      data: [
        { documentId: docs.find((d) => d.filename.includes('INV-2024-0892'))?.id || '', alertType: 'duplicate_invoice', severity: 'critical', description: 'INV-2024-0891 and INV-2024-0892 from BuildMax Supplies have identical amounts (INR 2,051,430) and line items. Likely a duplicate invoice.', status: 'open' },
        { documentId: docs.find((d) => d.filename.includes('INV-2024-0895'))?.id || '', alertType: 'price_anomaly', severity: 'high', description: 'Cement price in INV-2024-0895 is INR 470/bag vs PO price of INR 410/bag, a 14.6% increase.', status: 'open' },
      ],
    })

    return NextResponse.json({ success: true, message: 'Seeded 7 documents with demo data', documents: SAMPLE_DOCUMENTS.length })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed.' }, { status: 500 })
  }
}
