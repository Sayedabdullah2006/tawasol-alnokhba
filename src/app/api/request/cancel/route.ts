// إلغاء طلب غير مدفوع — يتيح للعميل الخروج من «النهاية المسدودة» وتقديم طلب جديد.
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

// الحالات التي يُسمح فيها للعميل بالإلغاء (قبل أي دفع مؤكَّد).
// نستثني payment_review (رفع إيصال تحويل — تتحقق منه الإدارة) وكل ما بعد الدفع.
const CANCELLABLE_STATUSES = ['pending', 'quoted', 'negotiation', 'approved', 'info_requested']

export async function POST(request: Request) {
  try {
    const { requestId } = await request.json()
    if (!requestId) {
      return NextResponse.json({ error: 'معرّف الطلب مطلوب' }, { status: 400 })
    }

    // المستخدم الحالي
    const userClient = await createServerSupabaseClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })
    }

    const supabase = await createServiceRoleClient()
    const { data: req } = await supabase
      .from('publish_requests')
      .select('id, user_id, status, receipt_url')
      .eq('id', requestId)
      .single()

    if (!req || req.user_id !== user.id) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (!CANCELLABLE_STATUSES.includes(req.status)) {
      return NextResponse.json({ error: 'لا يمكن إلغاء هذا الطلب في حالته الحالية' }, { status: 409 })
    }
    // رفع إيصال تحويل بنكي = الدفع قيد التحقق — لا يُلغى ذاتياً
    if (req.receipt_url) {
      return NextResponse.json({ error: 'الطلب قيد التحقق من الدفع — تواصل مع الدعم' }, { status: 409 })
    }

    const { error } = await supabase
      .from('publish_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)

    if (error) {
      console.error('Cancel request error:', error)
      return NextResponse.json({ error: 'تعذّر إلغاء الطلب' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Cancel request exception:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
