import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

    const { requestId, receiptUrl } = await request.json()

    const { data: req } = await supabase
      .from('publish_requests')
      .select('user_id, status')
      .eq('id', requestId)
      .single()

    if (!req) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (req.user_id !== user.id) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    if (req.status !== 'approved') {
      return NextResponse.json({ error: 'لا يمكن تأكيد الدفع الآن' }, { status: 400 })
    }

    const serviceClient = await createServiceRoleClient()
    const { error } = await serviceClient
      .from('publish_requests')
      .update({
        receipt_url: receiptUrl ?? null,
        status: 'payment_review',
        admin_notes: 'بانتظار تحقق الإدارة من إيصال التحويل البنكي',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Confirm transfer error:', error)
      return NextResponse.json({ error: 'فشل تأكيد التحويل' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Bank transfer error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
