import { createServiceRoleClient } from '@/lib/supabase-server'
import { xApiFetch } from '@/lib/x-oauth'
import type { NewsPost } from '@/lib/first1-news'

const ARCHIVE_SOURCE = 'first1saudi_x_archive'
const ARCHIVE_START = '2017-01-01'
const ARCHIVE_END = '2025-12-31'
// نافذة شهرية: تقدّم يومي مع عدد طلبات معقول، وتُضبط عند الحاجة عبر البيئة.
const WINDOW_DAYS = Math.max(1, Math.min(31, Number(process.env.X_ARCHIVE_WINDOW_DAYS) || 31))
const MAX_PAGES_PER_WINDOW = 10

type XMedia = { media_key?: string; type?: string; url?: string; preview_image_url?: string; alt_text?: string }
type XPost = {
  id: string
  text?: string
  created_at?: string
  attachments?: { media_keys?: string[] }
  public_metrics?: Record<string, number>
}
type XTimelineResponse = {
  data?: XPost[]
  includes?: { media?: XMedia[] }
  meta?: { next_token?: string; result_count?: number }
}

function dayAfter(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function xPostUrl(username: string, id: string) {
  return `https://x.com/${username}/status/${id}`
}

function firstImage(post: XPost, mediaByKey: Map<string, XMedia>) {
  for (const key of post.attachments?.media_keys ?? []) {
    const media = mediaByKey.get(key)
    if (!media) continue
    const url = media.type === 'photo' ? media.url : media.preview_image_url
    if (url) return url
  }
  return null
}

export type XArchiveImportResult = {
  imported: number
  windowStart: string
  windowEnd: string
  nextStartDate: string | null
  completed: boolean
}

/** Imports one bounded historical window; the saved cursor makes this safe to run every day. */
export async function importNextFirst1XArchiveWindow(): Promise<XArchiveImportResult> {
  const service = await createServiceRoleClient()
  const { data: connection, error: connectionError } = await service
    .from('x_oauth_tokens')
    .select('x_user_id,x_username')
    .eq('id', true)
    .maybeSingle()
  if (connectionError || !connection?.x_user_id || !connection.x_username) {
    throw new Error('حساب X غير متصل أو لا يحتوي على معرّف الحساب')
  }

  const { data: state, error: stateError } = await service
    .from('first1_x_archive_import_state')
    .select('next_start_date,completed')
    .eq('source', ARCHIVE_SOURCE)
    .maybeSingle()
  if (stateError) throw new Error(`تعذّر قراءة حالة أرشيف X: ${stateError.message}`)

  const windowStart = String(state?.next_start_date ?? ARCHIVE_START)
  if (state?.completed || windowStart > ARCHIVE_END) {
    return { imported: 0, windowStart, windowEnd: ARCHIVE_END, nextStartDate: null, completed: true }
  }
  const nextStartDate = dayAfter(windowStart, WINDOW_DAYS)
  const windowEnd = nextStartDate > ARCHIVE_END ? ARCHIVE_END : dayAfter(nextStartDate, -1)
  const untilExclusive = dayAfter(windowEnd, 1)

  const posts = new Map<string, XPost>()
  const mediaByKey = new Map<string, XMedia>()
  let nextToken: string | undefined
  try {
    for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
      const params = new URLSearchParams({
        max_results: '100',
        start_time: `${windowStart}T00:00:00Z`,
        end_time: `${untilExclusive}T00:00:00Z`,
        exclude: 'replies,retweets',
        'tweet.fields': 'created_at,attachments,public_metrics',
        expansions: 'attachments.media_keys',
        'media.fields': 'media_key,type,url,preview_image_url,alt_text',
      })
      if (nextToken) params.set('pagination_token', nextToken)
      const result = await xApiFetch<XTimelineResponse>(`/users/${connection.x_user_id}/tweets?${params.toString()}`)
      for (const post of result.data ?? []) posts.set(post.id, post)
      for (const media of result.includes?.media ?? []) {
        if (media.media_key) mediaByKey.set(media.media_key, media)
      }
      nextToken = result.meta?.next_token
      if (!nextToken) break
    }
  } catch (error) {
    await service.from('first1_x_archive_import_state').upsert({
      source: ARCHIVE_SOURCE,
      next_start_date: windowStart,
      last_window_start: windowStart,
      last_window_end: windowEnd,
      last_error: error instanceof Error ? error.message.slice(0, 1000) : 'تعذّر طلب X API',
      updated_at: new Date().toISOString(),
    })
    throw error
  }

  const rows = [...posts.values()]
    .filter(post => post.text?.trim() && post.created_at)
    .map(post => {
      const media = (post.attachments?.media_keys ?? []).map(key => mediaByKey.get(key)).filter(Boolean)
      return {
        x_post_id: post.id,
        post_url: xPostUrl(String(connection.x_username), post.id),
        post_text: post.text!.trim(),
        created_at_x: post.created_at,
        image_url: firstImage(post, mediaByKey),
        media,
        public_metrics: post.public_metrics ?? {},
        raw: post,
        imported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })
  if (rows.length) {
    const { error } = await service.from('first1_x_archive_posts').upsert(rows, { onConflict: 'x_post_id' })
    if (error) throw new Error(`تعذّر حفظ منشورات أرشيف X: ${error.message}`)
  }

  const completed = windowEnd >= ARCHIVE_END
  const { error: updateError } = await service.from('first1_x_archive_import_state').upsert({
    source: ARCHIVE_SOURCE,
    next_start_date: completed ? ARCHIVE_END : nextStartDate,
    last_window_start: windowStart,
    last_window_end: windowEnd,
    completed,
    last_error: null,
    updated_at: new Date().toISOString(),
  })
  if (updateError) throw new Error(`تعذّر تحديث تقدم أرشيف X: ${updateError.message}`)
  return { imported: rows.length, windowStart, windowEnd, nextStartDate: completed ? null : nextStartDate, completed }
}

function safeSocialId(xPostId: string): number {
  let hash = 0
  for (const char of xPostId) hash = (hash * 31 + char.charCodeAt(0)) % 9_000_000_000_000
  return hash || 1
}

export async function getFirst1XArchiveCandidates(excludedUrls: Set<string>, limit = 30): Promise<NewsPost[]> {
  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('first1_x_archive_posts')
    .select('x_post_id,post_url,post_text,created_at_x,image_url')
    .not('image_url', 'is', null)
    .order('created_at_x', { ascending: false })
    .limit(Math.max(limit * 4, 80))
  if (error) throw new Error(`تعذّر قراءة أرشيف X: ${error.message}`)

  return (data ?? [])
    .filter(row => /^\d+$/.test(String(row.x_post_id)) && !excludedUrls.has(String(row.post_url)))
    .sort(() => Math.random() - 0.5)
    .slice(0, limit)
    .map(row => ({
      // social_schedule keeps a numeric legacy identifier; the original X id stays lossless in post_url.
      id: safeSocialId(String(row.x_post_id)),
      url: String(row.post_url),
      title: String(row.post_text).replace(/\s+/g, ' ').slice(0, 110),
      content: String(row.post_text),
      categoryIds: [],
      categoryNames: ['أرشيف أول سعودي'],
      publishedAt: String(row.created_at_x),
      featuredMediaId: 0,
      bodyImages: [],
      imageUrl: String(row.image_url),
      imageSource: 'featured',
    }))
}

export async function getFirst1XArchiveStatus() {
  const service = await createServiceRoleClient()
  const [{ data: state }, { count }] = await Promise.all([
    service.from('first1_x_archive_import_state').select('next_start_date,last_window_start,last_window_end,completed,last_error,updated_at').eq('source', ARCHIVE_SOURCE).maybeSingle(),
    service.from('first1_x_archive_posts').select('*', { count: 'exact', head: true }),
  ])
  return { state: state ?? { next_start_date: ARCHIVE_START, completed: false }, importedPosts: count ?? 0 }
}
