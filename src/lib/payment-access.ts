import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { buildAuthHeader, MOYASAR_API_URL } from '@/lib/moyasar'

/** Legacy customer checkout remains session authenticated. Partner checkout has its own scoped session. */
export async function canVerifyCustomerPayment(paymentId: string, requestId?: string | null) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !/^[a-zA-Z0-9_-]{1,128}$/.test(paymentId)) return false
  const provider = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, { headers: { Authorization: buildAuthHeader() }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!provider.ok) return false
  const payment = await provider.json()
  if (payment.metadata?.resource_type === 'partner_order') return false
  const bound = payment.metadata?.request_id
  if (bound && requestId && bound !== requestId) return false
  const db = await createServiceRoleClient()
  // Historical settled payments can predate metadata: only their already-persisted provider id
  // is an acceptable fallback. A caller-supplied request id alone is never proof of ownership.
  const query = db.from('publish_requests').select('id,user_id,partner_id')
  const { data: order } = await (bound ? query.eq('id', bound) : query.eq('moyasar_payment_id', paymentId)).single()
  if (!order || order.partner_id) return false
  if (requestId && order.id !== requestId) return false
  if (order.user_id === user.id) return true
  const { data: profile } = await auth.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}
