import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentReadyForReview } from '@/lib/email'
import { validateRequestId, validateContent, ValidationException, formatValidationErrors } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const body = await request.json()
    const { requestId, proposedContent, proposedImages } = body

    // Validate input data
    try {
      validateRequestId(requestId)
      validateContent(proposedContent)
    } catch (error) {
      if (error instanceof ValidationException) {
        return NextResponse.json({ error: formatValidationErrors(error.errors) }, { status: 400 })
      }
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    // Get request details for email
    const { data: existingRequest } = await supabase
      .from('publish_requests')
      .select('request_number, client_name, client_email, status, post_reviews')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (existingRequest.status !== 'in_progress' && existingRequest.status !== 'changes_requested') {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة التنفيذ' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const images = Array.isArray(proposedImages) ? proposedImages : []
    const reviews: Record<string, any> = existingRequest.post_reviews && typeof existingRequest.post_reviews === 'object'
      ? { ...existingRequest.post_reviews }
      : {}
    const previous = reviews[0]
    const history: any[] = Array.isArray(previous?.history) ? [...previous.history] : []
    history.push({ content: proposedContent.trim(), images, sent_at: now })
    // الطلب المنفرد يستخدم الآن نفس مراجعة المنشور الدقيقة المستخدمة في الحملات.
    reviews[0] = {
      proposed_content: proposedContent.trim(), proposed_images: images, selected_image: null,
      status: 'content_review', user_feedback: null, text_feedback: null, design_feedback: null,
      revision_base_image: null, reference_images: [], content_sent_at: now, content_approved_at: null,
      feedback_sent_at: null, history,
    }

    // Update request with proposed content — clear previous feedback on re-send
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'content_review',
        proposed_content: proposedContent.trim(),
        proposed_images: proposedImages || [],
        post_reviews: reviews,
        content_sent_at: new Date().toISOString(),
        user_feedback: null,
        feedback_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    // Send notification email to client
    if (existingRequest.client_email) {
      const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
      notifyContentReadyForReview({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
        proposedContent,
        proposedImages: proposedImages || [],
      }).catch(e => console.error('Email notification failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
