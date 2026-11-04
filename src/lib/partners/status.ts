import { createServiceRoleClient } from '@/lib/supabase-server'
import { PartnerError, uuid, type PartnerContext } from './auth'
import { orderStateView, type CheckoutState } from './status-view'

/** Called only with orders already filtered by partner/customer ownership. */
export async function enrichPartnerOrderStates(orders: Record<string, unknown>[]) {
  if (!orders.length) return []
  const db = await createServiceRoleClient()
  const ids = orders.map(o => uuid(o.id))
  const [sessions, reviews] = await Promise.all([
    db.from('partner_checkout_sessions').select('request_id,status,expires_at,created_at,paid_at').in('request_id', ids).order('created_at', { ascending: false }),
    db.from('partner_payment_receipts').select('request_id').in('request_id', ids).eq('status', 'review_required'),
  ])
  if (sessions.error || reviews.error) throw new PartnerError('STATE_UNAVAILABLE', 503)
  const latest = new Map<string, CheckoutState>()
  const reviewIds = new Set((reviews.data ?? []).map(r => r.request_id))
  for (const session of sessions.data ?? []) {
    if (!latest.has(session.request_id)) latest.set(session.request_id, { status: session.status, expires_at: session.expires_at, created_at: session.created_at, paid_at: session.paid_at })
    if (session.status === 'review_required') reviewIds.add(session.request_id)
  }
  return orders.map(o => ({ ...o, ...orderStateView(o, latest.get(String(o.id)) ?? null, reviewIds.has(o.id)) }))
}

export async function readPartnerOrderState(ctx: PartnerContext, requestId: string) {
  const db = await createServiceRoleClient()
  const { data, error } = await db.from('publish_requests')
    .select('id,status,payment_status,paid_at,updated_at,refund_amount,refund_timing,content_sent_at,content_approved_at')
    .eq('id', uuid(requestId)).eq('partner_id', ctx.client.id).eq('external_customer_id', ctx.customer).maybeSingle()
  if (error) throw new PartnerError('STATE_UNAVAILABLE', 503)
  if (!data) throw new PartnerError('ORDER_NOT_FOUND', 404)
  const fields = ['id','status','payment_status','paid_at','updated_at','refund_timing','content_sent_at','content_approved_at'] as const
  const order = { ...Object.fromEntries(fields.map(key => [key, data[key]])), refund_amount: data.refund_amount == null ? null : Math.round(Number(data.refund_amount) * 100) }
  return (await enrichPartnerOrderStates([order]))[0]
}
