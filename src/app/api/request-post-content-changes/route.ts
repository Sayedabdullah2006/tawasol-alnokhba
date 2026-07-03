import { NextResponse } from 'next/server'
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
    const { requestId, feedback } = body
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

    const reviews: Record<string, any> =
      existingRequest.post_reviews && typeof existingRequest.post_reviews === 'object'
        ? { ...existingRequest.post_reviews }
        : {}
    const entry = reviews[postIndex]

    if (!entry || entry.status !== 'content_review') {
      return NextResponse.json({ error: 'هذا الخبر ليس في مرحلة المراجعة' }, { status: 400 })
    }

    reviews[postIndex] = {
      ...entry,
      status: 'changes_requested',
      user_feedback: feedback.trim(),
      feedback_sent_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('publish_requests')
      .update({
        post_reviews: reviews,
        status: 'in_progress', // طلب التعديل يُعيد الطلب لطاولة الأدمن
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    // ⚡ إعادة توليد التصاميم تلقائياً بملاحظة العميل في الخلفية (تُبقي القديمة + تضيف المعدّلة)
    void import('@/lib/auto-revise')
      .then(m => m.autoReviseFromFeedback({ requestId, postIndex, feedback: feedback.trim() }))
      .catch(e => console.error('[POST_CHANGES] auto-revise trigger failed:', e))

    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
    notifyContentChangesRequested({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
      feedback: feedback.trim(),
      proposedContent: entry.proposed_content ?? '',
    }).catch(e => console.error('Admin notification failed:', e))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Request post changes error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
