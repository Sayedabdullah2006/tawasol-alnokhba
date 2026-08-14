/**
 * عناصر المراجعة لكل طلب:
 * - حملة متعددة المنشورات → عنصر لكل خبر في campaign_posts.
 * - طلب مفرد → عنصر واحد (الخبر الرئيسي) بفهرس 0.
 *
 * تُستخدم في واجهتي العميل والأدمن لعرض/إرسال/اعتماد المحتوى لكل خبر على حدة.
 */
export interface ReviewItem {
  index: number
  title: string
  content: string
}

export interface PostReview {
  proposed_content?: string
  proposed_images?: string[]
  selected_image?: string | null
  status?: 'content_review' | 'approved' | 'changes_requested'
  user_feedback?: string | null
  text_feedback?: string | null
  design_feedback?: string | null
  revision_base_image?: string | null
  revision_analysis?: string | null
  content_sent_at?: string
  content_approved_at?: string | null
  feedback_sent_at?: string | null
  /** صور يرفقها العميل لتُضمَّن أو تُستبدل في التعديل المطلوب. */
  reference_images?: string[]
  /** الموعد المقترح للنشر، ويستطيع العميل تعديله قبل الاعتماد. */
  proposed_date?: string | null
  // سجل الجولات: كل إرسال يُضاف كجولة (تصاميم + نص + ملاحظة العميل)
  history?: Array<{
    images?: string[]
    content?: string
    sent_at?: string
    feedback?: string | null
    text_feedback?: string | null
    design_feedback?: string | null
    revision_base_image?: string | null
    revision_analysis?: string | null
    feedback_at?: string
    reference_images?: string[]
    approved?: boolean
    approved_at?: string
    selected_image?: string | null
  }>
}

type ReviewRequestSource = {
  request_type?: unknown
  campaign_posts?: unknown
  title?: unknown
  content?: unknown
  post_reviews?: unknown
  post_statuses?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function getReviewItems(request: ReviewRequestSource | null | undefined): ReviewItem[] {
  const posts = request?.campaign_posts
  if (request?.request_type === 'campaign' && Array.isArray(posts) && posts.length > 0) {
    return posts.map((post, i: number) => {
      const p = asRecord(post)
      return {
      index: i,
      title: typeof p.title === 'string' ? p.title : `منشور ${i + 1}`,
      content: typeof p.content === 'string' ? p.content : '',
      }
    })
  }
  return [{
    index: 0,
    title: typeof request?.title === 'string' ? request.title : 'الخبر',
    content: typeof request?.content === 'string' ? request.content : '',
  }]
}

/** يعيد كائن post_reviews كـ Record آمن (أو فارغ). */
export function getPostReviews(request: ReviewRequestSource | null | undefined): Record<string, PostReview> {
  const pr = request?.post_reviews
  return pr && typeof pr === 'object' && !Array.isArray(pr) ? (pr as Record<string, PostReview>) : {}
}

export type PostStatus = 'in_progress' | 'completed'

/** يعيد كائن post_statuses (حالة نشر كل منشور). الافتراضي: قيد التنفيذ. */
export function getPostStatuses(request: ReviewRequestSource | null | undefined): Record<string, PostStatus> {
  const ps = request?.post_statuses
  return ps && typeof ps === 'object' && !Array.isArray(ps) ? (ps as Record<string, PostStatus>) : {}
}
