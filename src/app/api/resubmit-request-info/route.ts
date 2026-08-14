import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyInfoResubmittedToAdmin } from '@/lib/email'
import { normalizeImageUrls, normalizeSupportingDocuments } from '@/lib/request-attachments'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/**
 * إعادة إرسال العميل لطلبه بعد تعديله (عند الحالة info_requested).
 * - طلب مفرد: يحدّث title / content / content_images.
 * - حملة: يحدّث لكل منشور title / content / images (دمج بالفهرس مع الحفاظ على بقية الحقول).
 * يعيد الحالة إلى in_progress ويُشعِر الأدمن.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId } = body

    if (!requestId) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (existing.status !== 'info_requested') {
      return NextResponse.json({ error: 'لا يمكن تعديل الطلب في حالته الحالية' }, { status: 400 })
    }

    const update: Record<string, unknown> = {
      status: 'in_progress',
      admin_info_request: null,
      updated_at: new Date().toISOString(),
    }

    const isCampaign = existing.request_type === 'campaign' && Array.isArray(existing.campaign_posts)

    if (isCampaign) {
      // دمج التعديلات لكل منشور بالفهرس مع الحفاظ على الحقول الأخرى
      const incoming = Array.isArray(body.campaignPosts) ? body.campaignPosts.map(asRecord) : []
      const existingPosts: unknown[] = existing.campaign_posts
      const merged = existingPosts.map((rawPost, i) => {
        const post = asRecord(rawPost)
        const edit = incoming[i] ?? {}
        return {
          ...post,
          title: typeof edit.title === 'string' ? edit.title : post.title,
          content: typeof edit.content === 'string' ? edit.content : post.content,
          images: Array.isArray(edit.images) ? normalizeImageUrls(edit.images) : normalizeImageUrls(post.images),
          supporting_documents: Array.isArray(edit.supportingDocuments)
            ? normalizeSupportingDocuments(edit.supportingDocuments)
            : (post.supporting_documents ?? []),
        }
      })
      update.campaign_posts = merged
    } else {
      if (typeof body.title === 'string') update.title = body.title.trim()
      if (typeof body.content === 'string') update.content = body.content.trim()
      if (Array.isArray(body.contentImages)) update.content_images = normalizeImageUrls(body.contentImages)
      if (Array.isArray(body.supportingDocuments)) update.supporting_documents = normalizeSupportingDocuments(body.supportingDocuments)
    }

    const { error } = await supabase
      .from('publish_requests')
      .update(update)
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    const requestNumber = `ATH-${String(existing.request_number).padStart(4, '0')}`
    notifyInfoResubmittedToAdmin({
      requestNumber,
      clientName: existing.client_name ?? 'العميل',
    }).catch(e => console.error('Admin notification failed:', e))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Resubmit request info error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
