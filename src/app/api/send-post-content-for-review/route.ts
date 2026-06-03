import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentReadyForReview } from '@/lib/email'
import { validateRequestId, validateContent, ValidationException, formatValidationErrors } from '@/lib/validation'

/**
 * إرسال محتوى/تصاميم خبر واحد (postIndex) للعميل للمراجعة.
 * يُخزّن في post_reviews[postIndex] ويُبقي حالة الطلب «قيد التنفيذ»،
 * فيمكن مراجعة كل خبر في الحملة على حدة.
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
    const { requestId, proposedContent, proposedImages } = body
    const postIndex = Number(body.postIndex)

    try {
      validateRequestId(requestId)
      validateContent(proposedContent)
    } catch (error) {
      if (error instanceof ValidationException) {
        return NextResponse.json({ error: formatValidationErrors(error.errors) }, { status: 400 })
      }
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    if (!Number.isInteger(postIndex) || postIndex < 0) {
      return NextResponse.json({ error: 'فهرس المنشور غير صالح' }, { status: 400 })
    }

    const { data: existingRequest } = await supabase
      .from('publish_requests')
      .select('request_number, client_name, client_email, status, post_reviews')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (existingRequest.status !== 'in_progress') {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة التنفيذ' }, { status: 400 })
    }

    const reviews: Record<string, any> =
      existingRequest.post_reviews && typeof existingRequest.post_reviews === 'object'
        ? { ...existingRequest.post_reviews }
        : {}

    reviews[postIndex] = {
      proposed_content: proposedContent.trim(),
      proposed_images: Array.isArray(proposedImages) ? proposedImages : [],
      selected_image: null,
      status: 'content_review',
      user_feedback: null,
      content_sent_at: new Date().toISOString(),
      content_approved_at: null,
      feedback_sent_at: null,
    }

    const { error } = await supabase
      .from('publish_requests')
      .update({ post_reviews: reviews, updated_at: new Date().toISOString() })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    if (existingRequest.client_email) {
      const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
      notifyContentReadyForReview({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
        proposedContent,
        proposedImages: Array.isArray(proposedImages) ? proposedImages : [],
      }).catch(e => console.error('Email notification failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send post content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
