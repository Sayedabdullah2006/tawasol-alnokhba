/**
 * POST /api/webhooks/tamara
 * Receives order status notifications from Tamara.
 * Register this URL once in: Partners Portal → Settings → Webhooks
 *
 * Always returns 200 to prevent Tamara from retrying infinitely.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyTamaraWebhookToken, handleTamaraOrderApproved } from '@/lib/tamara-server'

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

    // Only handle the approved event
    if (payload.event_type !== 'order_approved') {
      console.log('[TAMARA_WEBHOOK] Skipping event:', payload.event_type)
      return ok()
    }

    const { order_id, order_reference_id } = payload
    if (!order_id) {
      console.error('[TAMARA_WEBHOOK] Missing order_id in payload')
      return ok()
    }

    const result = await handleTamaraOrderApproved(order_id, order_reference_id ?? '')
    console.log('[TAMARA_WEBHOOK] Processing result:', result)

    return ok()
  } catch (error) {
    console.error('[TAMARA_WEBHOOK] Unhandled error:', error)
    return ok() // always 200
  }
}
