import { partnerGateway, type PartnerPaymentMode } from '@/lib/partners/payment-mode'
import { cookies } from 'next/headers'
import { checkoutOrigin, checkoutSession, settlePartnerPayment } from '@/lib/partners/checkout'
import { PartnerError, text } from '@/lib/partners/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
async function handle(request: Request) {
  try {
    const jar = await cookies()
    const sessionId = new URL(request.url).searchParams.get('session') ?? ''
    if (!/^[a-f0-9-]{36}$/.test(sessionId)) throw new PartnerError('INVALID_CHECKOUT', 401)
    const session = await checkoutSession(jar.get(`partner_checkout_${sessionId}`)?.value ?? '', request.method === 'POST')
    const db = await createServiceRoleClient()
    const { data: order } = await db.from('publish_requests').select('id,request_number,title,status,payment_status,final_total,package_snapshot').eq('id', session.request_id).single()
    if (!order) throw new PartnerError('ORDER_NOT_FOUND', 404)
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== checkoutOrigin()) throw new PartnerError('FORBIDDEN', 403)
      if (Date.now() - Date.parse(session.created_at) > 86400000) throw new PartnerError('CHECKOUT_EXPIRED', 410)
      const body = await request.json()
      const result = await settlePartnerPayment(text(body.payment_id, 128), session.id)
      return Response.json({ ...result, return_url: session.return_url }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return Response.json({ order_id: order.id, request_number: order.request_number, title: order.title, package_name: order.package_snapshot?.package?.name,
      amount: session.amount, currency: session.currency, status: order.payment_status === 'paid' ? 'paid' : order.status === 'approved' ? 'payable' : 'unavailable',
      publishable_key: partnerGateway(session.payment_mode as PartnerPaymentMode).publishable, payment_mode: session.payment_mode,
      return_url: session.return_url, expires_at: session.expires_at,
      metadata: { resource_type: 'partner_order', request_id: order.id, partner_checkout_id: session.id },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const known = error instanceof PartnerError
    return Response.json({ error: known ? error.code : 'CHECKOUT_UNAVAILABLE' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
export { handle as GET, handle as POST }
