import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

/**
 * تطبيق كود خصم على طلب «معتمد» قبل الدفع.
 * يتحقق من الكود ويحدّث final_total + حقول الخصم، ويعيد الإجمالي الجديد.
 * الخصم يُحتسب من السعر الأصلي (admin_quoted_price) فلا يتراكم.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

    const { requestId, code } = await request.json()
    if (!requestId || !code?.trim()) {
      return NextResponse.json({ error: 'أدخل الكود' }, { status: 400 })
    }

    const service = await createServiceRoleClient()
    const { data: req } = await service
      .from('publish_requests')
      .select('id, user_id, status, admin_quoted_price, discount_code_id')
      .eq('id', requestId)
      .single()

    if (!req) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (req.user_id !== user.id) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    if (req.status !== 'approved') {
      return NextResponse.json({ error: 'لا يمكن تطبيق الخصم على هذا الطلب' }, { status: 400 })
    }

    const { data: dc } = await service
      .from('discount_codes')
      .select('*')
      .eq('code', String(code).trim().toUpperCase())
      .single()

    if (!dc) return NextResponse.json({ error: 'الكود غير صحيح' }, { status: 400 })
    if (dc.recovery_draft_id) return NextResponse.json({ error: 'هذا العرض مرتبط بمسودة الطلب الأصلية' }, { status: 400 })
    if (!dc.is_active) return NextResponse.json({ error: 'الكود غير مفعّل' }, { status: 400 })
    if (new Date(dc.expires_at) < new Date()) return NextResponse.json({ error: 'انتهت صلاحية الكود' }, { status: 400 })
    if (dc.max_uses !== null && dc.used_count >= dc.max_uses) {
      return NextResponse.json({ error: 'تم استنفاد استخدامات الكود' }, { status: 400 })
    }

    const base = Number(req.admin_quoted_price ?? 0)
    const pct = Number(dc.discount_pct)
    const discountAmount = Math.min(
      Math.round(base * pct / 100),
      dc.max_discount_amount == null ? Number.POSITIVE_INFINITY : Number(dc.max_discount_amount),
    )
    const newTotal = Math.max(0, base - discountAmount)

    const { error } = await service
      .from('publish_requests')
      .update({
        final_total:      newTotal,
        discount_code:    dc.code,
        discount_code_id: dc.id,
        discount_pct:     pct,
        discount_amount:  discountAmount,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', requestId)
    if (error) return NextResponse.json({ error: 'فشل تطبيق الخصم' }, { status: 500 })

    // زيادة عدّاد الاستخدام (مرة واحدة لكل طلب — فقط إن لم يكن مطبّقاً سابقاً)
    if (req.discount_code_id !== dc.id) {
      await service.from('discount_codes').update({ used_count: dc.used_count + 1 }).eq('id', dc.id)
    }

    return NextResponse.json({ success: true, total: newTotal, discountPct: pct, discountAmount, code: dc.code })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
