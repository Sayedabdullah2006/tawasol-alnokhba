import { NextResponse } from 'next/server'
import type { PostReview } from '@/lib/review-items'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentChangesRequested } from '@/lib/email'
import { validateRequestId, validateUserFeedback, ValidationException, formatValidationErrors } from '@/lib/validation'

/**
 * طلب العميل تعديلات على محتوى/تصميم خبر واحد (postIndex).
 * يُحدّث post_reviews[postIndex] إلى changes_requested مع الملاحظات، ويُعيد حالة الطلب
 * إلى «قيد التنفيذ» ليعود لطاولة الأدمن (يعمل عبر عدة جولات مراجعة).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId } = body
    const textFeedback = typeof body.textFeedback === 'string' ? body.textFeedback.trim() : ''
    const designFeedback = typeof body.designFeedback === 'string' ? body.designFeedback.trim() : ''
    // توافق مع الطلبات القديمة التي كانت تستخدم حقل ملاحظة واحداً.
    const feedback = [textFeedback, designFeedback].filter(Boolean).join('\n\n') || (typeof body.feedback === 'string' ? body.feedback.trim() : '')
    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter((url: unknown): url is string => typeof url === 'string' && /^https:\/\//.test(url)).slice(0, 5)
      : []
    const postIndex = Number(body.postIndex)

    try {
      validateRequestId(requestId)
      validateUserFeedback(feedback)
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
      .select('*')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (existingRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (existingRequest.status !== 'content_review') {
      return NextResponse.json({ error: 'انتهت مرحلة مراجعة المحتوى لهذا الطلب' }, { status: 409 })
    }

    const reviews: Record<string, PostReview> =
      existingRequest.post_reviews && typeof existingRequest.post_reviews === 'object'
        ? { ...existingRequest.post_reviews }
        : {}
    const entry = reviews[postIndex]

    if (!entry || entry.status !== 'content_review') {
      return NextResponse.json({ error: 'هذا الخبر ليس في مرحلة المراجعة' }, { status: 400 })
    }
    const images: string[] = Array.isArray(entry.proposed_images) ? entry.proposed_images : []
    const selectedImage = typeof body.selectedImage === 'string' && images.includes(body.selectedImage)
      ? body.selectedImage
      : null
    if (images.length > 0 && !selectedImage) {
      return NextResponse.json({ error: 'اختر التصميم الأقرب لما تريده أولاً' }, { status: 400 })
    }

    // أرفق ملاحظة العميل بآخر جولة في السجل (هيستوري التصاميم + الملاحظات)
    const history: NonNullable<PostReview['history']> = Array.isArray(entry.history) ? [...entry.history] : []
    if (history.length) history[history.length - 1] = {
      ...history[history.length - 1], feedback, text_feedback: textFeedback || null, design_feedback: designFeedback || null,
      revision_base_image: selectedImage, feedback_at: new Date().toISOString(), reference_images: referenceImages,
    }

    reviews[postIndex] = {
      ...entry,
      status: 'changes_requested',
      user_feedback: feedback,
      text_feedback: textFeedback || null,
      design_feedback: designFeedback || null,
      revision_base_image: selectedImage,
      feedback_sent_at: new Date().toISOString(),
      reference_images: referenceImages,
      history,
    }

    const { data: updatedRows, error } = await supabase
      .from('publish_requests')
      .update({
        post_reviews: reviews,
        status: 'changes_requested', // العميل طلب تعديلات — يعود لطاولة الأدمن بحالة واضحة
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'content_review')
      .select('id')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    if (!updatedRows?.length) return NextResponse.json({ error: 'تغيّرت حالة الطلب، حدّث الصفحة قبل المتابعة' }, { status: 409 })

    // ⚡ إعادة توليد التصاميم تلقائياً بملاحظة العميل في الخلفية (تُبقي القديمة + تضيف المعدّلة)
    void import('@/lib/auto-revise')
      .then(m => m.autoReviseFromFeedback({ requestId, postIndex, feedback, textFeedback, designFeedback, selectedImage, referenceImages }))
      .catch(e => console.error('[POST_CHANGES] auto-revise trigger failed:', e))

    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
    notifyContentChangesRequested({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
      feedback,
      proposedContent: entry.proposed_content ?? '',
    }).catch(e => console.error('Admin notification failed:', e))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Request post changes error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
