import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createServiceInvoiceSnapshot, generateServiceInvoicePdf } from '@/lib/service-invoice'

/** Same central template, but never a fiscal record or production invoice number. */
export async function sandboxInvoice(order: Record<string, unknown>) {
  const db = await createServiceRoleClient()
  const id = String(order.id)
  const number = `SANDBOX-${id}`
  const existing = await db.from('partner_sandbox_invoices').select('pdf_base64').eq('request_id', id).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { pdf: Buffer.from(existing.data.pdf_base64, 'base64'), filename: `${number}.pdf` }
  const snapshot = createServiceInvoiceSnapshot(order, { provider: 'Moyasar SANDBOX', paidAt: String(order.paid_at), reference: String(order.moyasar_payment_id) })
  const pdf = await PDFDocument.load(await generateServiceInvoicePdf(snapshot, number))
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  for (const page of pdf.getPages()) {
    page.drawText('SANDBOX - TEST ONLY - NOT A FINANCIAL DOCUMENT', { x: 35, y: page.getHeight() - 15, size: 10, font, color: rgb(.7, .05, .05) })
    page.drawText('SANDBOX / NON-FISCAL', { x: 85, y: 280, size: 32, font, rotate: degrees(40), color: rgb(.8, .1, .1), opacity: .22 })
  }
  pdf.setTitle(`SANDBOX non-fiscal acceptance document ${id}`)
  const bytes = Buffer.from(await pdf.save())
  // Unique request key elects one original PDF even if two downloads race.
  const inserted = await db.from('partner_sandbox_invoices').insert({ request_id: id, invoice_number: number, pdf_base64: bytes.toString('base64') })
  if (inserted.error && inserted.error.code !== '23505') throw inserted.error
  const stored = await db.from('partner_sandbox_invoices').select('pdf_base64').eq('request_id', id).single()
  if (stored.error || !stored.data) throw stored.error ?? new Error('SANDBOX_INVOICE_UNAVAILABLE')
  return { pdf: Buffer.from(stored.data.pdf_base64, 'base64'), filename: `${number}.pdf` }
}
