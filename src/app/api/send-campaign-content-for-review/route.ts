import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyCampaignReadyForReview } from '@/lib/email'

/** يرسل الحملة كاملة إلى العميل برسالة واحدة، مع حفظ مراجعة مستقلة لكل منشور. */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const { requestId, proposedDates } = await request.json()
    if (typeof requestId !== 'string' || !requestId) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })

    const { data: row } = await supabase
      .from('publish_requests')
      .select('id, request_number, client_name, client_email, status, request_type, campaign_posts, ai_posts, post_reviews')
      .eq('id', requestId)
      .single()
    if (!row) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (row.request_type !== 'campaign' || !Array.isArray(row.campaign_posts) || row.campaign_posts.length === 0) {
      return NextResponse.json({ error: 'هذه العملية متاحة للحملات فقط' }, { status: 400 })
    }
    if (!['in_progress', 'content_review', 'changes_requested', 'completed'].includes(row.status)) {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة تجهيز المحتوى' }, { status: 400 })
    }

    const aiPosts = row.ai_posts && typeof row.ai_posts === 'object' ? row.ai_posts as Record<string, any> : {}
    const reviews = row.post_reviews && typeof row.post_reviews === 'object' ? { ...row.post_reviews as Record<string, any> } : {}
    const now = new Date().toISOString()
    const summaries: Array<{ title: string; content: string; proposedDate?: string | null; images: string[] }> = []
    const campaignPosts = [...row.campaign_posts]

    for (let index = 0; index < row.campaign_posts.length; index += 1) {
      const post = row.campaign_posts[index] as Record<string, any>
      const requestedDate = proposedDates && typeof proposedDates === 'object' && typeof proposedDates[index] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proposedDates[index])
        ? proposedDates[index]
        : (typeof post.preferred_date === 'string' ? post.preferred_date : null)
      const studio = aiPosts[index] ?? {}
      const content = String(studio?.tweets?.raw ?? post.content ?? '').trim()
      const images = Array.isArray(studio?.designs)
        ? studio.designs.map((design: any) => design?.imageUrl).filter((url: unknown): url is string => typeof url === 'string' && url.length > 0)
        : []
      if (!content || images.length === 0) {
        return NextResponse.json({ error: `أكمل النص وتصميماً واحداً على الأقل للمنشور ${index + 1} قبل إرسال الحملة.` }, { status: 400 })
      }

      const previous = reviews[index]
      const history = Array.isArray(previous?.history) ? [...previous.history] : []
      history.push({ content, images, sent_at: now })
      reviews[index] = {
        proposed_content: content,
        proposed_images: images,
        selected_image: null,
        status: 'content_review',
        user_feedback: null,
        content_sent_at: now,
        content_approved_at: null,
        feedback_sent_at: null,
        proposed_date: requestedDate,
        history,
      }
      if (requestedDate) campaignPosts[index] = { ...post, preferred_date: requestedDate }
      summaries.push({
        title: String(post.title ?? `منشور ${index + 1}`),
        content,
        proposedDate: requestedDate,
        images,
      })
    }

    const { error } = await supabase.from('publish_requests').update({
      post_reviews: reviews,
      campaign_posts: campaignPosts,
      status: 'content_review',
      content_sent_at: now,
      updated_at: now,
    }).eq('id', requestId)
    if (error) return NextResponse.json({ error: 'فشل حفظ مراجعة الحملة' }, { status: 500 })

    if (row.client_email) {
      const requestNumber = `ATH-${String(row.request_number).padStart(4, '0')}`
      void notifyCampaignReadyForReview({
        email: row.client_email,
        requestNumber,
        requestId: row.id,
        clientName: row.client_name ?? 'عزيزنا العميل',
        posts: summaries,
      })
    }
    return NextResponse.json({ success: true, postsCount: summaries.length })
  } catch (error) {
    console.error('Send campaign content error:', error)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
