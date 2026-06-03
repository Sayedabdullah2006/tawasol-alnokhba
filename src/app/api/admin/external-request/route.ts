/**
 * External Request API Route
 * يتيح للأدمن تسجيل طلب نُشر ودُفع خارج المنصة، ليُحتسب ضمن إحصاءات الموقع وإيراداته.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    // التحقق من صلاحية الأدمن
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
      clientName, category, amount, title, paidAt, influencerId,
    } = body as {
      clientName?: string
      category?: string
      amount?: number
      title?: string
      paidAt?: string
      influencerId?: string | null
    }

    // تحقق من المدخلات الأساسية
    if (!clientName?.trim()) {
      return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 })
    }
    if (!category?.trim()) {
      return NextResponse.json({ error: 'الفئة مطلوبة' }, { status: 400 })
    }
    const price = Number(amount)
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
    }

    const sc = await createServiceRoleClient()

    // وقت الدفع/النشر: التاريخ المُدخل أو الآن
    const paidIso = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString()
    const now = new Date().toISOString()

    // سجل طلب خارجي مكتمل ومدفوع — request_number يُولَّد تلقائياً عبر تسلسل القاعدة
    const { data, error } = await sc
      .from('publish_requests')
      .insert({
        is_external:        true,
        influencer_id:      influencerId || null,
        category:           category.trim(),
        scope:              'single',
        images:             'one',
        request_type:       'single',
        title:              title?.trim() || 'طلب خارجي',
        content:            title?.trim() || 'طلب مُسجَّل يدوياً من الإدارة (نُشر ودُفع خارج المنصة)',
        client_name:        clientName.trim(),
        client_phone:       '-',
        client_email:       '-',
        num_posts:          1,
        base_price:         price,
        extras_total:       0,
        vat_amount:         0,
        total_amount:       price,
        admin_quoted_price: price,
        final_total:        price,
        status:             'completed',
        quoted_at:          paidIso,
        approved_at:        paidIso,
        paid_at:            paidIso,
        last_status_change: now,
        created_at:         paidIso,
        updated_at:         now,
      })
      .select('id, request_number')
      .single()

    if (error) {
      console.error('[EXTERNAL_REQUEST] Insert failed:', error)
      return NextResponse.json({ error: 'فشل في حفظ الطلب الخارجي' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id, requestNumber: data.request_number })
  } catch (err) {
    console.error('[EXTERNAL_REQUEST] Exception:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
