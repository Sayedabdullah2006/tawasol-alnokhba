import { partnerGateway, type PartnerPaymentMode } from './payment-mode'
import { createHmac } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { MOYASAR_API_URL } from '@/lib/moyasar'
import { configuredClients, equalSecret, PartnerError, uuid } from './auth'

export function checkoutToken(id: string) {
  const secret = process.env.PARTNER_CHECKOUT_SECRET
  if (!secret || secret.length < 32) throw new PartnerError('CHECKOUT_NOT_CONFIGURED', 503)
  return `${id}.${createHmac('sha256', secret).update(`partner-checkout-v1:${id}`).digest('hex')}`
}
export async function checkoutSession(token: string, allowExpired = false) {
  const id = uuid(token.split('.')[0])
  if (!equalSecret(checkoutToken(id), token)) throw new PartnerError('INVALID_CHECKOUT', 401)
  const db = await createServiceRoleClient()
  const { data, error } = await db.from('partner_checkout_sessions').select('*').eq('id', id).single()
  if (error || !data) throw new PartnerError('CHECKOUT_NOT_FOUND', 404)
  if (!allowExpired && Date.parse(data.expires_at) <= Date.now()) throw new PartnerError('CHECKOUT_EXPIRED', 410)
  return data
}
export function checkoutOrigin() {
  const url = new URL(process.env.PARTNER_CHECKOUT_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nukhba.media')
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) throw new PartnerError('CHECKOUT_NOT_CONFIGURED', 503)
  return url.origin
}
/** Provider data is fetched server-side; caller supplied request ids never override provider bindings. */
export async function settlePartnerPayment(paymentId: string, expectedSession?: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(paymentId)) throw new PartnerError('INVALID_PAYMENT_ID')
  if (!expectedSession) throw new PartnerError('PAYMENT_CONTEXT_REQUIRED', 401)
  const db = await createServiceRoleClient()
  const { data: session } = await db.from('partner_checkout_sessions').select('id,request_id,payment_mode').eq('id', uuid(expectedSession)).single()
  if (!session) throw new PartnerError('CHECKOUT_NOT_FOUND', 404)
  const gateway = partnerGateway(session.payment_mode as PartnerPaymentMode)
  const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, { headers: { Authorization: gateway.authorization }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new PartnerError('PAYMENT_PROVIDER_UNAVAILABLE', 503)
  const payment = await response.json()
  const sessionId = uuid(payment.metadata?.partner_checkout_id)
  const requestId = uuid(payment.metadata?.request_id)
  if (payment.metadata?.resource_type !== 'partner_order' || sessionId !== session.id || requestId !== session.request_id) throw new PartnerError('PAYMENT_BINDING_MISMATCH', 409)
  if (payment.status !== 'paid') return { paid: false, status: payment.status, applied: false }
  const { data, error } = await db.rpc('partner_settle_payment', { p_session: sessionId, p_request: requestId, p_payment: payment.id, p_amount: payment.amount, p_currency: payment.currency })
  if (error) throw new PartnerError('PAYMENT_RECONCILIATION_REQUIRED', 409)
  if (data.applied && session.payment_mode === 'live') {
    // Only the atomic winner runs fulfillment. Customer notifications are central, never sent twice by the frontend.
    const { data: order } = await db.from('publish_requests').select('client_email,client_name,request_number,final_total,partner_id').eq('id', requestId).single()
    const partner = configuredClients().find(p => p.id === order?.partner_id)
    if (order?.client_email && partner?.notifications !== false) {
      const { notifyPaymentConfirmedToClient } = await import('@/lib/email')
      await notifyPaymentConfirmedToClient({ requestId, email: order.client_email, clientName: order.client_name, requestNumber: String(order.request_number), total: Number(order.final_total) }).catch(() => undefined)
    }
    if (partner?.auto_studio !== false) void import('@/lib/auto-studio').then(m => m.autoRunRequestStudio(requestId)).catch(e => console.error('[PARTNER_STUDIO]', e))
  }
  return { paid: !data.review_required, applied: data.applied, review_required: !!data.review_required, status: data.review_required ? 'review_required' : 'paid' }
}
