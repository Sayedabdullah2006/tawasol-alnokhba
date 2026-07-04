import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentReadyForReview } from '@/lib/email'
import { validateRequestId, validateContent, ValidationException, formatValidationErrors } from '@/lib/validation'

/**
 * إرسال محتوى/تصاميم خبر واحد (postIndex) للعميل للمراجعة.
 * يُخزّن في post_reviews[postIndex] ويحوّل حالة الطلب إلى «مراجعة المحتوى».
 * يظل بالإمكان إرسال/تعديل بقية منشورات الحملة أثناء المراجعة.
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
    // يُسمح بالإرسال أثناء التنفيذ/المراجعة/طلب التعديل (لإرسال أو إعادة إرسال المحتوى)
    if (!['in_progress', 'content_review', 'changes_requested'].includes(existingRequest.status)) {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة التنفيذ' }, { status: 400 })
    }

    const reviews: Record<string, any> =
      existingRequest.post_reviews && typeof existingRequest.post_reviews === 'object'
        ? { ...existingRequest.post_reviews }
        : {}

    // إن كان لهذا الخبر محتوى مُرسل سابقاً فهذا تعديل/إعادة إرسال (نُخصّص الإيميل)
    const prevEntry = reviews[postIndex]
    const isEdit = !!prevEntry
    const now = new Date().toISOString()
    const images = Array.isArray(proposedImages) ? proposedImages : []

    // سجل الجولات: نضيف كل إرسال كجولة (تصاميم + نص + وقت) للاحتفاظ بالهيستوري كاملاً
    const history: any[] = Array.isArray(prevEntry?.history) ? [...prevEntry.history] : []
    history.push({ content: proposedContent.trim(), images, sent_at: now })

    reviews[postIndex] = {
      proposed_content: proposedContent.trim(),
      proposed_images: images,
      selected_image: null,
      status: 'content_review',
      user_feedback: null,
      content_sent_at: now,
      content_approved_at: null,
      feedback_sent_at: null,
      history,
    }

    const { error } = await supabase
      .from('publish_requests')
      .update({
        post_reviews: reviews,
        status: 'content_review', // إرسال محتوى للمراجعة يحوّل حالة الطلب إلى «مراجعة المحتوى»
        content_sent_at: existingRequest.status === 'in_progress' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
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
        edited: isEdit,
      }).catch(e => console.error('Email notification failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send post content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
