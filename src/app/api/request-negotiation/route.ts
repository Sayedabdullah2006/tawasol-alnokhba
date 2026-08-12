import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyNegotiationRequestedByClient, notifyNegotiatedQuoteToClient, notifyNegotiationRequestToClient } from '@/lib/email'

// ── سلّم الخصومات الآلي ──────────────────────────────────────────
// الجولة 1: 5%  |  الجولة 2: 10%  |  الجولة 3: 15% (نهائي)
const DISCOUNT_LADDER = [0.05, 0.10, 0.15]
const MAX_ROUNDS = 3

// ── القيد الشهري ──────────────────────────────────────────────────
// الحد الأقصى من جولات التفاوض لكل حساب خلال 30 يوماً (مشترك بين جميع الطلبات)
// يمنع العميل من التعوّد على طلب خصم 3 مرات في كل طلب
export const MONTHLY_ROUNDS_LIMIT = 3
const ROLLING_DAYS = 30

// ── GET: جلب الحصة الشهرية للمستخدم الحالي ──────────────────────
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const since = new Date(Date.now() - ROLLING_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: rows } = await supabase
      .from('publish_requests')
      .select('negotiation_round')
      .eq('user_id', user.id)
      .gte('negotiation_requested_at', since)
      .not('negotiation_round', 'is', null)

    const monthlyUsed = rows?.reduce((sum, r) => sum + (r.negotiation_round ?? 0), 0) ?? 0
    const monthlyRemaining = Math.max(0, MONTHLY_ROUNDS_LIMIT - monthlyUsed)

    return NextResponse.json({
      monthlyUsed,
      monthlyLimit: MONTHLY_ROUNDS_LIMIT,
      monthlyRemaining,
      rollingDays: ROLLING_DAYS,
    })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// ── POST: تنفيذ جولة تفاوض ────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId, negotiationReason, proposedPrice } = body

    if (!requestId) {
      return NextResponse.json({ error: 'معرف الطلب مطلوب' }, { status: 400 })
    }

    // ── جلب الطلب ──────────────────────────────────────────────────
    const { data: req } = await supabase
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!req) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (req.user_id !== user.id) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    if (req.status !== 'quoted') {
      return NextResponse.json({ error: 'لا يمكن التفاوض في هذه المرحلة' }, { status: 400 })
    }
    // التحقق من مهلة الموافقة (24 ساعة) — لا تفاوض بعد انتهاء العرض
    if (req.quote_expires_at && new Date(req.quote_expires_at).getTime() < Date.now()) {
      return NextResponse.json({
        error: 'انتهى وقت العرض — تواصل مع الإدارة لتجديده',
        expired: true,
      }, { status: 400 })
    }

    // ── فحص حد الطلب الواحد (3 جولات/طلب) ────────────────────────
    if (req.negotiation_rejected || req.negotiation_round >= MAX_ROUNDS) {
      return NextResponse.json({
        error: 'وصلت للحد الأقصى من جولات التفاوض — السعر المعروض نهائي',
        isFinal: true,
      }, { status: 400 })
    }

    // ── فحص الحصة الشهرية (3 جولات إجمالية/شهر لكل حساب) ──────────
    const since = new Date(Date.now() - ROLLING_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentRows } = await supabase
      .from('publish_requests')
      .select('negotiation_round')
      .eq('user_id', user.id)
      .gte('negotiation_requested_at', since)
      .not('negotiation_round', 'is', null)

    // نستثني الطلب الحالي من العدّ (سيُحتسب بعد النجاح)
    const monthlyUsed = recentRows
      ?.filter(r => r.negotiation_round != null)
      .reduce((sum, r) => {
        // الطلب الحالي: نحتسب الجولات السابقة فقط (ليس الجولة الجارية)
        return sum + (r.negotiation_round ?? 0)
      }, 0) ?? 0

    if (monthlyUsed >= MONTHLY_ROUNDS_LIMIT) {
      const nextReset = new Date(Date.now() + ROLLING_DAYS * 24 * 60 * 60 * 1000)
      const resetDate = nextReset.toLocaleDateString('ar-SA', { month: 'long', day: 'numeric' })
      return NextResponse.json({
        error: `استنفدت حصتك الشهرية من التفاوض (${MONTHLY_ROUNDS_LIMIT} جولات / 30 يوماً)`,
        monthlyLimitReached: true,
        resetHint: `يمكنك التفاوض مجدداً بعد ${resetDate}`,
        monthlyUsed,
        monthlyLimit: MONTHLY_ROUNDS_LIMIT,
      }, { status: 429 })
    }

    // ── احتساب الجولة والسعر الجديد ────────────────────────────────
    const currentRound = (req.negotiation_round ?? 0) + 1
    const isFinalRound = currentRound >= MAX_ROUNDS
    const monthlyRemaining = MONTHLY_ROUNDS_LIMIT - (monthlyUsed + 1) // بعد هذه الجولة

    const originalPrice = Number(req.original_quoted_price ?? req.admin_quoted_price ?? 0)
    const discountPct   = DISCOUNT_LADDER[currentRound - 1]
    const ourMinPrice   = Math.round(originalPrice * (1 - discountPct))

    const clientPrice = proposedPrice ? Number(proposedPrice) : 0
    const counterPrice = (clientPrice > 0 && clientPrice >= ourMinPrice)
      ? clientPrice
      : ourMinPrice

    const actualDiscountPct = originalPrice > 0
      ? Math.round(((originalPrice - counterPrice) / originalPrice) * 100)
      : 0

    const requestNumber = `ATH-${String(req.request_number).padStart(4, '0')}`
    const now = new Date().toISOString()
    // مهلة الموافقة على العرض المعدّل — 24 ساعة من إصداره
    const quoteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const requiresAdminReview = String(req.category ?? '').trim().toLowerCase() === 'others'

    // ── تحديث قاعدة البيانات ───────────────────────────────────────
    const { error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status:                     requiresAdminReview ? 'negotiation' : 'quoted',
        ...(requiresAdminReview ? {} : {
          admin_quoted_price: counterPrice,
          original_quoted_price: originalPrice,
          final_total: counterPrice,
          negotiated_at: now,
          negotiated_discount_percentage: actualDiscountPct,
          negotiation_price_source: clientPrice >= ourMinPrice && clientPrice > 0
            ? 'client_accepted'
            : 'admin_discount',
          quote_expires_at: quoteExpiresAt,
          user_selected_extras: [],
          extras_selected_total: 0,
        }),
        negotiation_round:           currentRound,
        negotiation_rejected:        isFinalRound,
        negotiation_reason:          negotiationReason?.trim() ?? null,
        client_proposed_price:       clientPrice || null,
        negotiation_requested_at:    now,
        last_status_change:          now,
        updated_at:                  now,
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Negotiation DB error:', updateError)
      return NextResponse.json({ error: 'فشل معالجة طلب التفاوض' }, { status: 500 })
    }

    if (req.client_email && requiresAdminReview) {
      notifyNegotiationRequestToClient({
        email: req.client_email,
        requestNumber,
        clientName: req.client_name ?? 'عزيزنا العميل',
      }).catch(e => console.error('Negotiation receipt email failed:', e))
    } else if (req.client_email) {
      notifyNegotiatedQuoteToClient({
        email:              req.client_email,
        requestNumber,
        clientName:         req.client_name ?? 'عزيزنا العميل',
        originalPrice,
        newPrice:           counterPrice,
        discountPercentage: actualDiscountPct,
        adminMessage:       '',
        priceSource:        'admin_discount',
      }).catch(e => console.error('Auto-negotiation client email failed:', e))
    }

    if (requiresAdminReview) notifyNegotiationRequestedByClient({
      requestNumber,
      clientName:        req.client_name ?? 'العميل',
      negotiationReason: negotiationReason?.trim() ?? '—',
      originalPrice,
      proposedPrice:     clientPrice || null,
    }).catch(e => console.error('Admin negotiation notification failed:', e))

    return NextResponse.json({
      success:          true,
      round:            currentRound,
      maxRounds:        MAX_ROUNDS,
      isFinal:          isFinalRound,
      requiresAdminReview,
      ...(requiresAdminReview ? {} : { counterPrice, discountPct: actualDiscountPct }),
      // ── الحصة الشهرية ──
      monthlyUsed:      monthlyUsed + 1,
      monthlyLimit:     MONTHLY_ROUNDS_LIMIT,
      monthlyRemaining: Math.max(0, monthlyRemaining),
    })

  } catch (err) {
    console.error('Request negotiation error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
