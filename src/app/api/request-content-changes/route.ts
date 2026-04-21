import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentChangesRequested } from '@/lib/email'
import { validateRequestId, validateUserFeedback, ValidationException, formatValidationErrors } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId, feedback } = body

    // Validate input data
    try {
      validateRequestId(requestId)
      validateUserFeedback(feedback)
    } catch (error) {
      if (error instanceof ValidationException) {
        return NextResponse.json({ error: formatValidationErrors(error.errors) }, { status: 400 })
      }
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
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

    // Update request with feedback and change status back to in_progress for admin action
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'in_progress',
        user_feedback: feedback.trim(),
        feedback_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    // Send notification email to admin
    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
    notifyContentChangesRequested({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
      feedback: feedback.trim(),
      proposedContent: existingRequest.proposed_content,
    }).catch(e => console.error('Admin notification failed:', e))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Request changes error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}