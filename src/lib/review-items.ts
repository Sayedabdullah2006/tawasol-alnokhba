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
  content_sent_at?: string
  content_approved_at?: string | null
  feedback_sent_at?: string | null
  // سجل الجولات: كل إرسال يُضاف كجولة (تصاميم + نص + ملاحظة العميل)
  history?: Array<{
    images?: string[]
    content?: string
    sent_at?: string
    feedback?: string | null
    feedback_at?: string
    approved?: boolean
    selected_image?: string | null
  }>
}

export function getReviewItems(request: any): ReviewItem[] {
  const posts = request?.campaign_posts
  if (request?.request_type === 'campaign' && Array.isArray(posts) && posts.length > 0) {
    return posts.map((p: any, i: number) => ({
      index: i,
      title: (p?.title as string) || `منشور ${i + 1}`,
      content: (p?.content as string) || '',
    }))
  }
  return [{ index: 0, title: (request?.title as string) || 'الخبر', content: (request?.content as string) || '' }]
}

/** يعيد كائن post_reviews كـ Record آمن (أو فارغ). */
export function getPostReviews(request: any): Record<string, PostReview> {
  const pr = request?.post_reviews
  return pr && typeof pr === 'object' && !Array.isArray(pr) ? (pr as Record<string, PostReview>) : {}
}

export type PostStatus = 'in_progress' | 'completed'

/** يعيد كائن post_statuses (حالة نشر كل منشور). الافتراضي: قيد التنفيذ. */
export function getPostStatuses(request: any): Record<string, PostStatus> {
  const ps = request?.post_statuses
  return ps && typeof ps === 'object' && !Array.isArray(ps) ? (ps as Record<string, PostStatus>) : {}
}
