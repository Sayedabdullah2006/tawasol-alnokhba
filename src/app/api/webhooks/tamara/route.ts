/**
 * POST /api/webhooks/tamara
 * Receives order status notifications from Tamara.
 * Register this URL once in: Partners Portal → Settings → Webhooks
 *
 * Always returns 200 to prevent Tamara from retrying infinitely.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyTamaraWebhookToken, handleTamaraMembershipApproved, handleTamaraMembershipTopupApproved, handleTamaraOrderApproved } from '@/lib/tamara-server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { completeProviderRefund } from '@/lib/refund-webhooks'

export async function POST(request: NextRequest) {
  const ok = () => NextResponse.json({ received: true }, { status: 200 })

  try {
    // Extract tamaraToken from query param or Authorization header
    const { searchParams } = new URL(request.url)
    const tokenFromQuery  = searchParams.get('tamaraToken')
    const authHeader      = request.headers.get('authorization') ?? ''
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token = tokenFromQuery ?? tokenFromHeader

    if (!token) {
      console.error('[TAMARA_WEBHOOK] Missing tamaraToken')
      return ok() // still 200 — we can't retry this
    }

    if (!verifyTamaraWebhookToken(token)) {
      console.error('[TAMARA_WEBHOOK] Invalid JWT signature')
      return ok()
    }

    const payload = await request.json()
    console.log('[TAMARA_WEBHOOK] Received event:', payload.event_type, 'order:', payload.order_id)

    if (payload.event_type === 'order_refunded' && payload.order_id) {
      const result = await completeProviderRefund({
        provider: 'tamara', providerPaymentId: payload.order_id,
        providerRefundId: payload.data?.refund_id ?? null, payload,
      })
      console.log('[TAMARA_WEBHOOK] Refund result:', result)
      return ok()
    }

    // Only handle the approved payment event beyond refunds.
    if (payload.event_type !== 'order_approved') {
      console.log('[TAMARA_WEBHOOK] Skipping event:', payload.event_type)
      return ok()
    }

    const { order_id, order_reference_id } = payload
    if (!order_id) {
      console.error('[TAMARA_WEBHOOK] Missing order_id in payload')
      return ok()
    }

    const service = await createServiceRoleClient()
    const { data: topupByOrder } = await service.from('membership_topups').select('id').eq('provider_payment_id', order_id).limit(1).maybeSingle()
    const { data: topupByReference } = !topupByOrder && order_reference_id
      ? await service.from('membership_topups').select('id').eq('id', order_reference_id).limit(1).maybeSingle()
      : { data: null }
    const topup = topupByOrder ?? topupByReference
    if (topup) {
      const result = await handleTamaraMembershipTopupApproved(order_id, order_reference_id ?? '')
      console.log('[TAMARA_WEBHOOK] Membership topup result:', result)
      return ok()
    }
    const { data: membershipByOrder } = await service.from('memberships').select('id').eq('tamara_order_id', order_id).limit(1).maybeSingle()
    const { data: membershipByReference } = !membershipByOrder && order_reference_id
      ? await service.from('memberships').select('id').eq('id', order_reference_id).limit(1).maybeSingle()
      : { data: null }
    const membership = membershipByOrder ?? membershipByReference
    const result = membership
      ? await handleTamaraMembershipApproved(order_id, order_reference_id ?? '')
      : await handleTamaraOrderApproved(order_id, order_reference_id ?? '')
    console.log('[TAMARA_WEBHOOK] Processing result:', result)

    return ok()
  } catch (error) {
    console.error('[TAMARA_WEBHOOK] Unhandled error:', error)
    return ok() // always 200
  }
}
