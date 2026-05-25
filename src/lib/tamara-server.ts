/**
 * Tamara Server-Side Integration
 * All functions here are server-only (use secrets from env).
 */

import { createHmac } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'
import {
  TAMARA_API_URL,
  getTamaraCallbackUrls,
  normalizeSaudiPhone,
  splitName,
} from '@/lib/tamara'
import { notifyPaymentConfirmedToClient } from '@/lib/email'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getApiToken(): string {
  const key =
    process.env.NODE_ENV === 'production'
      ? process.env.TAMARA_API_TOKEN
      : (process.env.TAMARA_API_TOKEN_SANDBOX ?? process.env.TAMARA_API_TOKEN)
  if (!key) throw new Error('TAMARA_API_TOKEN is not configured')
  return key
}

function getNotificationToken(): string {
  const key = process.env.TAMARA_NOTIFICATION_TOKEN
  if (!key) throw new Error('TAMARA_NOTIFICATION_TOKEN is not configured')
  return key
}

function authHeader(): string {
  return `Bearer ${getApiToken()}`
}

// ─── JWT verification ─────────────────────────────────────────────────────────

/**
 * Verify a Tamara webhook JWT (HS256) using the Notification Token.
 * Returns true if signature is valid and token is not expired.
 */
export function verifyTamaraWebhookToken(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [header, payload, signature] = parts

    // Verify signature
    const expectedSig = createHmac('sha256', getNotificationToken())
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

    if (signature !== expectedSig) return false

    // Check expiry
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return false

    return true
  } catch {
    return false
  }
}

// ─── Create Checkout Session ──────────────────────────────────────────────────

export interface TamaraCheckoutResult {
  success: boolean
  checkoutUrl?: string
  orderId?: string
  checkoutId?: string
  error?: string
}

export async function createTamaraCheckoutSession(
  requestId: string
): Promise<TamaraCheckoutResult> {
  const supabase = await createServiceRoleClient()

  // Fetch order details
  const { data: order, error: orderError } = await supabase
    .from('publish_requests')
    .select('id, request_number, client_name, client_email, client_phone, client_city, final_total, admin_quoted_price, status')
    .eq('id', requestId)
    .single()

  if (orderError || !order) {
    return { success: false, error: 'الطلب غير موجود' }
  }

  if (order.status !== 'approved') {
    return { success: false, error: 'الطلب غير جاهز للدفع' }
  }

  const totalSAR = Number(order.final_total ?? order.admin_quoted_price ?? 0)
  if (totalSAR <= 0) {
    return { success: false, error: 'مبلغ الطلب غير صحيح' }
  }

  const { first, last } = splitName(order.client_name ?? 'عميل')
  const phone = normalizeSaudiPhone(order.client_phone ?? '')
  const city  = order.client_city ?? 'الرياض'
  const reqNum = String(order.request_number)
  const callbackUrls = getTamaraCallbackUrls(requestId)

  const body = {
    order_reference_id: requestId,
    order_number:       reqNum,
    total_amount:       { amount: totalSAR, currency: 'SAR' },
    shipping_amount:    { amount: 0,        currency: 'SAR' },
    tax_amount:         { amount: 0,        currency: 'SAR' },
    description:        `حملة تسويقية - طلب رقم ${reqNum}`,
    country_code:       'SA',
    payment_type:       'PAY_BY_INSTALMENTS',
    instalments:        3,
    locale:             'ar_SA',
    items: [
      {
        reference_id: requestId,
        type:         'Digital',
        name:         `حملة تسويقية - طلب ${reqNum}`,
        sku:          `SVC-${reqNum}`,
        quantity:     1,
        total_amount: { amount: totalSAR, currency: 'SAR' },
      },
    ],
    consumer: {
      first_name:   first,
      last_name:    last,
      phone_number: phone,
      email:        order.client_email ?? '',
    },
    shipping_address: {
      first_name:   first,
      last_name:    last,
      line1:        'خدمة رقمية',
      city,
      country_code: 'SA',
    },
    merchant_url: callbackUrls,
  }

  console.log('[TAMARA] Creating checkout session for request:', requestId)

  const res = await fetch(`${TAMARA_API_URL}/checkout`, {
    method:  'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error('[TAMARA] Checkout creation failed:', res.status, data)
    return {
      success: false,
      error: (data as any)?.message ?? 'فشل في إنشاء جلسة الدفع مع تمارا',
    }
  }

  const { order_id, checkout_id, checkout_url } = data as any

  // Store tamara_order_id immediately so webhook can find the request
  await supabase
    .from('publish_requests')
    .update({ tamara_order_id: order_id, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  console.log('[TAMARA] ✅ Checkout session created:', { order_id, checkout_id })
  return { success: true, checkoutUrl: checkout_url, orderId: order_id, checkoutId: checkout_id }
}

// ─── Fetch Order Details ──────────────────────────────────────────────────────

/**
 * Fetch order details from Tamara API to verify amount before processing.
 * Returns the total amount in SAR, or null if the request fails.
 */
async function fetchTamaraOrderAmount(tamaraOrderId: string): Promise<number | null> {
  try {
    const res = await fetch(`${TAMARA_API_URL}/orders/${tamaraOrderId}`, {
      headers: { 'Authorization': authHeader() },
    })
    if (!res.ok) {
      console.error('[TAMARA] Failed to fetch order details:', res.status)
      return null
    }
    const data = await res.json() as { total_amount?: { amount?: number } }
    return Number(data.total_amount?.amount ?? 0) || null
  } catch (err) {
    console.error('[TAMARA] Error fetching order:', err)
    return null
  }
}

// ─── Authorize Order ──────────────────────────────────────────────────────────

export async function authorizeTamaraOrder(orderId: string): Promise<boolean> {
  console.log('[TAMARA] Authorizing order:', orderId)

  const res = await fetch(`${TAMARA_API_URL}/orders/${orderId}/authorise`, {
    method:  'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[TAMARA] Authorization failed:', res.status, err)
    return false
  }

  console.log('[TAMARA] ✅ Order authorized:', orderId)
  return true
}

// ─── Handle Approved Webhook ──────────────────────────────────────────────────

export async function handleTamaraOrderApproved(
  tamaraOrderId: string,
  orderReferenceId: string
): Promise<{ success: boolean; reason: string }> {
  const supabase = await createServiceRoleClient()

  // Idempotency: skip if already processed
  const { data: existing } = await supabase
    .from('publish_requests')
    .select('id, status, client_name, client_email, request_number, final_total, admin_quoted_price')
    .eq('tamara_order_id', tamaraOrderId)
    .maybeSingle()

  const target = existing ?? null
  let requestId = orderReferenceId

  if (target) {
    if (target.status === 'in_progress') {
      console.log('[TAMARA] Already processed:', tamaraOrderId)
      return { success: true, reason: 'already_processed' }
    }
    requestId = target.id
  }

  // ── التحقق من مبلغ الدفع مع تمارا ────────────────────────────────
  const tamaraAmount = await fetchTamaraOrderAmount(tamaraOrderId)
  if (tamaraAmount !== null) {
    // Fetch expected amount from DB (use existing row if available)
    let expectedAmount: number | null = null
    if (target) {
      expectedAmount = Number(target.final_total ?? target.admin_quoted_price ?? 0) || null
    } else {
      const { data: dbReq } = await supabase
        .from('publish_requests')
        .select('final_total, admin_quoted_price')
        .eq('id', requestId)
        .single()
      if (dbReq) {
        expectedAmount = Number(dbReq.final_total ?? dbReq.admin_quoted_price ?? 0) || null
      }
    }
    if (expectedAmount !== null && tamaraAmount !== expectedAmount) {
      console.error(
        `[TAMARA] ❌ Amount mismatch: Tamara=${tamaraAmount} SAR, DB=${expectedAmount} SAR`
      )
      return { success: false, reason: 'amount_mismatch' }
    }
    console.log(`[TAMARA] ✅ Amount verified: ${tamaraAmount} SAR`)
  } else {
    // إذا فشل جلب التفاصيل، نكمل بحذر ونسجّل تحذيراً
    console.warn('[TAMARA] ⚠️ Could not verify amount from Tamara API — proceeding with caution')
  }

  // Authorize with Tamara first
  const authorized = await authorizeTamaraOrder(tamaraOrderId)
  if (!authorized) {
    return { success: false, reason: 'authorization_failed' }
  }

  // Update DB: set status to in_progress
  const { data: updated, error: updateError } = await supabase
    .from('publish_requests')
    .update({
      status:           'in_progress',
      payment_status:   'paid',
      paid_at:          new Date().toISOString(),
      payment_method:   'تمارا - تقسيط',
      tamara_order_id:  tamaraOrderId,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'approved')
    .select('id, client_name, client_email, request_number, final_total, admin_quoted_price')

  if (updateError) {
    console.error('[TAMARA] DB update failed:', updateError)
    return { success: false, reason: 'db_update_failed' }
  }

  const emailRow = (updated && updated.length > 0) ? updated[0] : null
  if (!emailRow && !target) return { success: false, reason: 'order_not_found' }

  // Send confirmation email (non-blocking)
  const emailData = emailRow ?? target
  const clientEmail = (emailData as any)?.client_email
  if (clientEmail) {
    const total = Number(
      (emailData as any)?.final_total ?? (emailData as any)?.admin_quoted_price ?? 0
    )
    notifyPaymentConfirmedToClient({
      email:         clientEmail,
      requestNumber: String((emailData as any)?.request_number ?? ''),
      clientName:    (emailData as any)?.client_name ?? '',
      total,
    }).catch((err: unknown) => {
      console.error('[TAMARA] Email send failed (non-blocking):', err)
    })
  }

  console.log('[TAMARA] ✅ Order processed successfully:', requestId)
  return { success: true, reason: 'verified_and_updated' }
}
