import { partnerData } from './data'
import { ensureServiceInvoice } from '@/lib/service-invoice'
import { PartnerError, uuid, type PartnerContext } from './auth'

/** Return the central invoice only after checking the signed partner/customer pair. */
export async function partnerInvoice(ctx: PartnerContext, requestId: string, trace: string) {
  const db = await partnerData(ctx.client)
  const { data: order, error } = await db.from('publish_requests')
    .select('*')
    .eq('id', uuid(requestId)).eq('partner_id', ctx.client.id)
    .eq('external_customer_id', ctx.customer).maybeSingle()
  if (error) throw new PartnerError('INVOICE_UNAVAILABLE', 503)
  if (!order) throw new PartnerError('ORDER_NOT_FOUND', 404)
  // A provider id or checkout session alone is not proof of payment. Refunds retain the original invoice.
  const paid = order.payment_status === 'paid' || (Boolean(order.paid_at) &&
    (order.payment_status === 'refunded' || ['refund_pending', 'refunded'].includes(order.status)))
  if (!paid || Number(order.final_total) <= 0) throw new PartnerError('INVOICE_NOT_AVAILABLE', 409)
  let invoice
  try { invoice = ctx.client.sandbox_only === true ? await (await import('./sandbox-invoice')).sandboxInvoice(order) : await ensureServiceInvoice(order.id) }
  catch { throw new PartnerError('INVOICE_UNAVAILABLE', 503) }
  const filename = /^[a-zA-Z0-9_-]+\.pdf$/.test(invoice.filename) ? invoice.filename : `invoice-${order.id}.pdf`
  return new Response(new Uint8Array(invoice.pdf), { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Trace-ID': trace,
    'X-Document-Environment': ctx.client.sandbox_only === true ? 'sandbox' : 'live',
  } })
}
