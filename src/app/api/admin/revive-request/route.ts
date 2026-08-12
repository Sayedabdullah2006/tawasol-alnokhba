import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyQuoteReadyToClient } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json() as {
      requestId?: string
      discountPct?: number
      validDays?: number
      message?: string
    }
    const discountPct = Number(body.discountPct ?? 0)
    const validDays = Number(body.validDays ?? 3)

    if (!body.requestId || !Number.isFinite(discountPct) || discountPct < 0 || discountPct >= 100) {
      return NextResponse.json({ error: 'نسبة الخصم يجب أن تكون بين 0 و99' }, { status: 400 })
    }
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
      return NextResponse.json({ error: 'مدة العرض يجب أن تكون من يوم إلى 30 يوماً' }, { status: 400 })
    }

    const { data: requestRow, error: fetchError } = await supabase
      .from('publish_requests')
      .select('id, status, request_number, client_name, client_email, admin_quoted_price, final_total, estimated_reach, quote_expires_at, offer_original_price, offer_discount_pct')
      .eq('id', body.requestId)
      .single()

    if (fetchError || !requestRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (requestRow.status !== 'auto_closed') {
      return NextResponse.json({ error: 'يمكن إحياء الطلبات التي أُغلقت تلقائياً فقط' }, { status: 422 })
    }
    if (!requestRow.client_email) return NextResponse.json({ error: 'لا يوجد بريد إلكتروني لإرسال العرض' }, { status: 422 })

    const originalPrice = Number(requestRow.final_total ?? requestRow.admin_quoted_price ?? 0)
    if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
      return NextResponse.json({ error: 'لا يوجد سعر صالح لإحياء هذا الطلب' }, { status: 422 })
    }

    const revivedPrice = Math.round(originalPrice * (1 - discountPct / 100) * 100) / 100
    const quoteExpiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
    const defaultMessage = discountPct > 0
      ? `عرض عودة خاص لك: خصم ${discountPct}% على طلبك السابق، ويمكنك استكماله من الرابط قبل انتهاء العرض.`
      : 'أعدنا فتح طلبك السابق لتتمكن من استكماله من الرابط قبل انتهاء العرض.'
    const adminMessage = body.message?.trim() || defaultMessage

    const { data: updated, error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status: 'quoted',
        admin_quoted_price: revivedPrice,
        final_total: revivedPrice,
        offer_original_price: originalPrice,
        offer_discount_pct: discountPct || null,
        quoted_at: new Date().toISOString(),
        quote_expires_at: quoteExpiresAt,
        last_status_change: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id)
      .eq('status', 'auto_closed')
      .select('*')
      .single()

    if (updateError || !updated) {
      console.error('Revive request update failed:', updateError)
      return NextResponse.json({ error: 'تعذّر تجهيز عرض الإحياء' }, { status: 500 })
    }

    const requestNumber = `ATH-${String(requestRow.request_number).padStart(4, '0')}`
    const emailSent = await notifyQuoteReadyToClient({
      email: requestRow.client_email,
      requestNumber,
      clientName: requestRow.client_name ?? 'عزيزنا',
      price: revivedPrice,
      reach: Number(requestRow.estimated_reach ?? 0),
      quoteExpiresAt,
      adminMessage,
    })

    if (!emailSent) {
      await supabase
        .from('publish_requests')
        .update({
          status: 'auto_closed',
          admin_quoted_price: requestRow.admin_quoted_price,
          final_total: requestRow.final_total,
          offer_original_price: requestRow.offer_original_price,
          offer_discount_pct: requestRow.offer_discount_pct,
          quote_expires_at: requestRow.quote_expires_at,
          last_status_change: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)

      return NextResponse.json({ error: 'تعذّر إرسال البريد، ولم يتم تغيير حالة الطلب' }, { status: 502 })
    }

    return NextResponse.json({ success: true, request: updated, emailSent: true })
  } catch (error) {
    console.error('Revive request error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إحياء الطلب' }, { status: 500 })
  }
}
