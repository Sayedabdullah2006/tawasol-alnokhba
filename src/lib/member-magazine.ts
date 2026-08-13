import { createServiceRoleClient } from '@/lib/supabase-server'

export type MemberMagazineItem = {
  id: string
  requestNumber: number
  title: string
  category: string
  content: string
  cover: string
  approvedAt: string
}

export type MemberMagazineProfile = {
  id: string
  membershipId: string
  displayName: string
  bio: string
  shareToken: string
  isPublic: boolean
  planName: string
  planId: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function extractApprovedMagazineItems(rows: Array<Record<string, unknown>>): MemberMagazineItem[] {
  const items: MemberMagazineItem[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const reviews = record(row.post_reviews)
    const campaignPosts = Array.isArray(row.campaign_posts) ? row.campaign_posts.map(record) : []

    for (const [key, rawReview] of Object.entries(reviews)) {
      const review = record(rawReview)
      if (review.status !== 'approved') continue
      const cover = text(review.selected_image)
      if (!cover || seen.has(cover)) continue

      const postIndex = Number(key)
      const post = Number.isInteger(postIndex) ? campaignPosts[postIndex] ?? {} : {}
      const approvedAt = text(review.content_approved_at) || text(row.content_approved_at) || text(row.updated_at) || text(row.created_at)
      seen.add(cover)
      items.push({
        id: `${text(row.id)}-${key}`,
        requestNumber: Number(row.request_number ?? 0),
        title: text(post.title) || text(row.title) || `منشور ${postIndex + 1}`,
        category: text(row.category) || 'منوّعات',
        content: text(review.proposed_content) || text(post.content) || text(row.content),
        cover,
        approvedAt,
      })
    }
  }

  return items.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
}

export async function loadMemberMagazineItems(membershipId: string): Promise<MemberMagazineItem[]> {
  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('publish_requests')
    .select('id, request_number, title, category, content, campaign_posts, post_reviews, content_approved_at, updated_at, created_at')
    .eq('membership_id', membershipId)
    .not('post_reviews', 'is', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`تعذّر تحميل التصاميم المعتمدة: ${error.message}`)
  return extractApprovedMagazineItems((data ?? []) as Array<Record<string, unknown>>)
}
