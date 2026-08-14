import { NextResponse } from 'next/server'
import type { PostReview } from '@/lib/review-items'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentApprovedToAdmin } from '@/lib/email'

/**
 * اعتماد العميل لمحتوى/تصميم خبر واحد (postIndex) مع اختيار تصميم واحد.
 * يُحدّث post_reviews[postIndex]، وعند اعتماد كل منشورات الطلب تُنقل حالة الطلب
 * إلى «قيد التنفيذ» (جاهز لينشره الأدمن) — مطابقةً لمسار الاعتماد المفرد.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId, selectedImage } = body
    const postIndex = Number(body.postIndex)
    const proposedDate = typeof body.proposedDate === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(body.proposedDate)
      ? body.proposedDate
      : null

    if (!requestId || !Number.isInteger(postIndex) || postIndex < 0) {
      return NextResponse.json({ error: 'بيانات غير كاملة' }, { status: 400 })
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

    // التصميم المختار يجب أن يكون من بين التصاميم المُرسلة (إن وُجدت تصاميم)
    const images: string[] = Array.isArray(entry.proposed_images) ? entry.proposed_images : []
    const chosen = typeof selectedImage === 'string' && images.includes(selectedImage)
      ? selectedImage
      : (images[0] ?? null)

    if (images.length > 0 && !chosen) {
      return NextResponse.json({ error: 'اختر تصميماً أولاً' }, { status: 400 })
    }

    const now = new Date().toISOString()
    // وسم آخر جولة في السجل بأنها معتمدة + التصميم المختار
    const history: NonNullable<PostReview['history']> = Array.isArray(entry.history) ? [...entry.history] : []
    if (history.length) history[history.length - 1] = { ...history[history.length - 1], approved: true, selected_image: chosen, approved_at: now }

    reviews[postIndex] = {
      ...entry,
      status: 'approved',
      selected_image: chosen,
      user_feedback: null,
      content_approved_at: now,
      proposed_date: proposedDate ?? entry.proposed_date ?? null,
      history,
    }

    // هل اعتُمدت كل منشورات الطلب الآن؟ (المفرد = منشور واحد)
    const isCampaign = existingRequest.request_type === 'campaign' && Array.isArray(existingRequest.campaign_posts)
    const totalPosts = isCampaign ? existingRequest.campaign_posts.length : 1
    const approvedCount = Object.values(reviews).filter(entry => entry?.status === 'approved').length
    const allApproved = approvedCount >= totalPosts

    const upd: Record<string, unknown> = { post_reviews: reviews, updated_at: now }
    if (isCampaign && proposedDate) {
      const posts = [...existingRequest.campaign_posts]
      if (posts[postIndex]) posts[postIndex] = { ...posts[postIndex], preferred_date: proposedDate }
      upd.campaign_posts = posts
    }
    if (allApproved) { upd.status = 'in_progress'; upd.content_approved_at = now } // خرج من مرحلة المراجعة

    const { data: updatedRows, error } = await supabase
      .from('publish_requests')
      .update(upd)
      .eq('id', requestId)
      .eq('status', 'content_review')
      .select('id')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }
    if (!updatedRows?.length) return NextResponse.json({ error: 'تغيّرت حالة الطلب، حدّث الصفحة قبل المتابعة' }, { status: 409 })

    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
    notifyContentApprovedToAdmin({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
    }).catch(e => console.error('Admin notification failed:', e))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Approve post content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
