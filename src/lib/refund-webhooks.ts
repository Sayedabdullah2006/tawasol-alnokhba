import { createServiceRoleClient } from '@/lib/supabase-server'
import { notifyRefundUpdateToClient } from '@/lib/email'
import { generateRequestNumber } from '@/lib/utils'

const TIMING = {
  moyasar: '3 إلى 10 أيام عمل',
  tamara: 'ساعات إلى عدة أيام عمل',
  manual: 'يومين إلى 5 أيام عمل',
} as const

type Provider = keyof typeof TIMING

export async function completeProviderRefund(args: {
  provider: Exclude<Provider, 'manual'>
  providerPaymentId: string
  providerRefundId?: string | null
  payload?: unknown
}): Promise<{ handled: boolean; reason: string }> {
  const service = await createServiceRoleClient()

  let refund: any = null
  if (args.providerRefundId) {
    const { data } = await service.from('payment_refunds').select('*')
      .eq('provider', args.provider).eq('provider_refund_id', args.providerRefundId).maybeSingle()
    refund = data
  }
  if (!refund) {
    const { data } = await service.from('payment_refunds').select('*')
      .eq('provider', args.provider).eq('provider_payment_id', args.providerPaymentId)
      .eq('status', 'pending').order('requested_at', { ascending: false }).limit(1).maybeSingle()
    refund = data
  }
  if (!refund) return { handled: false, reason: 'no_matching_pending_refund' }
  if (refund.status === 'completed') return { handled: true, reason: 'already_completed' }

  const now = new Date().toISOString()
  const { error: refundError } = await service.from('payment_refunds').update({
    status: 'completed', processed_at: now, updated_at: now,
    provider_refund_id: args.providerRefundId ?? refund.provider_refund_id,
    provider_response: args.payload ?? refund.provider_response,
  }).eq('id', refund.id).eq('status', 'pending')
  if (refundError) throw new Error(`refund_update_failed: ${refundError.message}`)

  const { data: publishRequest } = await service.from('publish_requests')
    .select('id, request_number, client_name, client_email, final_total, admin_quoted_price')
    .eq('id', refund.request_id).maybeSingle()
  if (!publishRequest) return { handled: false, reason: 'request_not_found' }

  const { data: completedRefunds } = await service.from('payment_refunds').select('amount')
    .eq('request_id', refund.request_id).eq('status', 'completed')
  const refundedAmount = (completedRefunds ?? []).reduce((total, item) => total + Number(item.amount), 0)
  const paidAmount = Number(publishRequest.final_total ?? publishRequest.admin_quoted_price ?? 0)
  const isFullRefund = refundedAmount >= paidAmount - 0.001

  const { error: requestError } = await service.from('publish_requests').update({
    ...(isFullRefund ? { status: 'refunded' } : {}),
    payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
    refund_amount: Math.round(refundedAmount * 100) / 100,
    refund_timing: TIMING[args.provider],
    updated_at: now,
  }).eq('id', refund.request_id)
  if (requestError) throw new Error(`request_update_failed: ${requestError.message}`)

  if (publishRequest.client_email) {
    notifyRefundUpdateToClient({
      email: publishRequest.client_email,
      requestNumber: generateRequestNumber(publishRequest.request_number),
      clientName: publishRequest.client_name ?? 'عميلنا العزيز',
      amount: Number(refund.amount), timing: TIMING[args.provider], isPending: false,
    }).catch(error => console.error('Refund webhook email failed:', error))
  }

  return { handled: true, reason: isFullRefund ? 'fully_refunded' : 'partially_refunded' }
}
