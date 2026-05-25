import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyNegotiationRequestedByClient, notifyNegotiatedQuoteToClient, notifyNegotiationRejectedToClient } from '@/lib/email'

// ── سلّم الخصومات الآلي ──────────────────────────────────────────
// الجولة 1: 5%  |  الجولة 2: 10%  |  الجولة 3: 15% (نهائي)
const DISCOUNT_LADDER = [0.05, 0.10, 0.15]
const MAX_ROUNDS = 3

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

    // ── فحص الحد الأقصى ────────────────────────────────────────────
    if (req.negotiation_rejected || req.negotiation_round >= MAX_ROUNDS) {
      return NextResponse.json({
        error: 'وصلت للحد الأقصى من جولات التفاوض — السعر المعروض نهائي',
        isFinal: true,
      }, { status: 400 })
    }

    // ── احتساب الجولة والسعر الجديد ────────────────────────────────
    const currentRound = (req.negotiation_round ?? 0) + 1
    const isFinalRound = currentRound >= MAX_ROUNDS

    // السعر الأصلي: دائماً من أول عرض (قبل أي تفاوض سابق)
    const originalPrice = Number(req.original_quoted_price ?? req.admin_quoted_price ?? 0)
    const discountPct   = DISCOUNT_LADDER[currentRound - 1]       // 0.05 / 0.10 / 0.15
    const ourMinPrice   = Math.round(originalPrice * (1 - discountPct))

    // إذا اقترح العميل سعراً أعلى أو يساوي الحد الأدنى للجولة → نقبله
    const clientPrice = proposedPrice ? Number(proposedPrice) : 0
    const counterPrice = (clientPrice > 0 && clientPrice >= ourMinPrice)
      ? clientPrice
      : ourMinPrice

    const actualDiscountPct = originalPrice > 0
      ? Math.round(((originalPrice - counterPrice) / originalPrice) * 100)
      : 0

    const requestNumber = `ATH-${String(req.request_number).padStart(4, '0')}`
    const now = new Date().toISOString()

    // ── تحديث قاعدة البيانات ───────────────────────────────────────
    const { error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status:                     'quoted',
        admin_quoted_price:          counterPrice,
        original_quoted_price:       originalPrice,  // نحفظه من أول جولة
        final_total:                 counterPrice,
        negotiation_round:           currentRound,
        negotiation_rejected:        isFinalRound,   // يُقفل التفاوض بعد الجولة 3
        negotiation_reason:          negotiationReason?.trim() ?? null,
        client_proposed_price:       clientPrice || null,
        negotiation_requested_at:    now,
        negotiated_at:               now,
        negotiated_discount_percentage: actualDiscountPct,
        negotiation_price_source:    clientPrice >= ourMinPrice && clientPrice > 0
                                       ? 'client_accepted'
                                       : 'admin_discount',
        last_status_change:          now,
        updated_at:                  now,
        user_selected_extras:        [],
        extras_selected_total:       0,
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Negotiation DB error:', updateError)
      return NextResponse.json({ error: 'فشل معالجة طلب التفاوض' }, { status: 500 })
    }

    // ── رسالة الجولة للعميل ────────────────────────────────────────
    const roundLabel = isFinalRound
      ? `الجولة ${currentRound} من ${MAX_ROUNDS} — هذا عرضنا النهائي ولا يمكن التفاوض أكثر`
      : `الجولة ${currentRound} من ${MAX_ROUNDS} — تبقّت ${MAX_ROUNDS - currentRound} جولة`

    if (req.client_email) {
      notifyNegotiatedQuoteToClient({
        email:              req.client_email,
        requestNumber,
        clientName:         req.client_name ?? 'عزيزنا العميل',
        originalPrice,
        newPrice:           counterPrice,
        discountPercentage: actualDiscountPct,
        adminMessage:       roundLabel,
        priceSource:        'admin_discount',
      }).catch(e => console.error('Auto-negotiation client email failed:', e))
    }

    // ── إخطار المدير (للمراجعة فقط — لا إجراء مطلوب) ──────────────
    notifyNegotiationRequestedByClient({
      requestNumber,
      clientName:       req.client_name ?? 'العميل',
      negotiationReason: negotiationReason?.trim() ?? '—',
      originalPrice,
      proposedPrice:    clientPrice || null,
    }).catch(e => console.error('Admin negotiation notification failed:', e))

    return NextResponse.json({
      success:      true,
      round:        currentRound,
      maxRounds:    MAX_ROUNDS,
      isFinal:      isFinalRound,
      counterPrice,
      discountPct:  actualDiscountPct,
    })

  } catch (err) {
    console.error('Request negotiation error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
