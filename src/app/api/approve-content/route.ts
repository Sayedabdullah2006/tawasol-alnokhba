import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentApprovedToAdmin, notifyContentApprovedToClient } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId } = body

    if (!requestId) {
      return NextResponse.json({ error: 'بيانات غير كاملة' }, { status: 400 })
    }

    // Get request details
    const { data: existingRequest } = await supabase
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    // Verify the user owns this request
    if (existingRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    if (existingRequest.status !== 'content_review') {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة مراجعة المحتوى' }, { status: 400 })
    }

    // Update request status back to in_progress
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'in_progress',
        content_approved_at: new Date().toISOString(),
        user_feedback: null, // Clear any previous feedback
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    // Send notifications
    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`

    // Notify admin
    notifyContentApprovedToAdmin({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
    }).catch(e => console.error('Admin notification failed:', e))

    // Notify client
    if (existingRequest.client_email) {
      notifyContentApprovedToClient({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
      }).catch(e => console.error('Client notification failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Approve content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}