import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyInfoRequestedToClient } from '@/lib/email'

/**
 * طلب الأدمن معلومات/صورة إضافية من العميل.
 * يضبط الحالة إلى info_requested ويخزّن رسالة الأدمن، ويُشعِر العميل بالبريد.
 * يُسمح به أثناء «قيد التنفيذ» (in_progress).
 */
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
    const { requestId } = body
    const message = String(body.message ?? '').trim()

    if (!requestId || message.length < 5) {
      return NextResponse.json({ error: 'اكتب رسالة توضّح المطلوب من العميل' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('publish_requests')
      .select('request_number, client_name, client_email, status')
      .eq('id', requestId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (existing.status !== 'in_progress') {
      return NextResponse.json({ error: 'يمكن طلب التعديل فقط أثناء مرحلة التنفيذ' }, { status: 400 })
    }

    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'info_requested',
        admin_info_request: message,
        info_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    if (existing.client_email) {
      const requestNumber = `ATH-${String(existing.request_number).padStart(4, '0')}`
      notifyInfoRequestedToClient({
        email: existing.client_email,
        requestNumber,
        clientName: existing.client_name ?? 'عزيزنا العميل',
        message,
      }).catch(e => console.error('Email notification failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Request more info error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
