import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyQuoteReadyToClient, notifyFreeGiftToClient } from '@/lib/email'
import { EXTRAS } from '@/lib/constants'
import { EXTRAS_REACH_BOOST } from '@/lib/pricing-engine'

interface OfferedExtra {
  id: string
  name: string
  price: number
  reachBoost?: number
}

// يبني القائمة الكاملة للخدمات الإضافية المعروضة على العميل بعد وصول العرض.
// يستثني الخدمات المقيّدة بفئة (categoryOnly) إذا لم تطابق فئة الطلب.
function buildOfferedExtras(category: string | null | undefined): OfferedExtra[] {
  return (EXTRAS as Array<{ id: string; nameAr: string; price: number; categoryOnly?: string }>)
    .filter(extra => !extra.categoryOnly || extra.categoryOnly === category)
    .map(extra => {
      const offered: OfferedExtra = {
        id:    extra.id,
        name:  extra.nameAr,
        price: extra.price,
      }
      const boost = EXTRAS_REACH_BOOST[extra.id]
      if (boost != null) offered.reachBoost = boost
      return offered
    })
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const body = await request.json()
    const {
      requestId, quotedPrice, offeredExtras, adminNotes, baseReach,
    } = body as {
      requestId: string
      quotedPrice: number
      offeredExtras: OfferedExtra[]
      adminNotes?: string
      baseReach: number
    }

    if (typeof quotedPrice !== 'number' || quotedPrice < 0) {
      return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 })
    }

    // مهلة الموافقة على العرض — 24 ساعة من إرسال التسعيرة
    const quoteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: updated, error } = await supabase
      .from('publish_requests')
      .update({
        admin_quoted_price:            quotedPrice,
        admin_offered_extras:          offeredExtras ?? [],
        user_selected_extras:          [],
        extras_selected_total:         0,
        final_total:                   quotedPrice,
        estimated_reach:               baseReach ?? 0,
        status:                        'quoted',
        quoted_at:                     new Date().toISOString(),
        last_status_change:            new Date().toISOString(),
        admin_notes:                   adminNotes ?? null,
        quote_expires_at:              quoteExpiresAt,
        updated_at:                    new Date().toISOString(),
        // ── إعادة ضبط حقول التفاوض ─────────────────────────────────────
        // عند إرسال عرض يدوي جديد يبدأ التفاوض من الصفر
        original_quoted_price:         null,
        negotiation_round:             0,
        negotiation_rejected:          false,
        negotiation_reason:            null,
        client_proposed_price:         null,
      })
      .eq('id', requestId)
      .select('request_number, client_name, client_email')
      .single()

    if (error) {
      console.error('Send quote error:', error)
      return NextResponse.json({ error: 'فشل إرسال التسعيرة' }, { status: 500 })
    }

    // Notify client — free vs paid gets a different template
    if (updated?.client_email) {
      const requestNumber = `ATH-${String(updated.request_number).padStart(4, '0')}`
      const args = {
        email: updated.client_email,
        requestNumber,
        clientName: updated.client_name ?? 'عزيزنا',
      }
      const promise = quotedPrice <= 0
        ? notifyFreeGiftToClient({ ...args, adminMessage: adminNotes ?? '' })
        : notifyQuoteReadyToClient({
            ...args,
            price: quotedPrice,
            reach: baseReach ?? 0,
            quoteExpiresAt,
          })
      promise.catch(e => console.error('Quote email failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Quote error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
