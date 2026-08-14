import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase-server'
import { getXConnection, xApiFetch } from '@/lib/x-oauth'

type MetricBag = Record<string, number | undefined>

type StoredXPost = {
  x_post_id: string
  post_url: string
  post_text: string
  created_at_x: string
  updated_at: string
  image_url: string | null
  public_metrics: MetricBag | null
  raw: Record<string, unknown> | null
}

type XMedia = {
  media_key?: string
  type?: string
  url?: string
  preview_image_url?: string
  alt_text?: string
  public_metrics?: MetricBag
  non_public_metrics?: MetricBag
}

type XPost = {
  id: string
  text?: string
  created_at?: string
  author_id?: string
  referenced_tweets?: Array<{ type?: string; id?: string }>
  attachments?: { media_keys?: string[] }
  public_metrics?: MetricBag
  non_public_metrics?: MetricBag
  organic_metrics?: MetricBag
}

type XTimelineResponse = {
  data?: XPost[]
  includes?: {
    media?: XMedia[]
    users?: Array<{ id: string; username?: string; name?: string }>
  }
  meta?: { next_token?: string }
}

type XAccountResponse = {
  data?: {
    id: string
    username?: string
    name?: string
    created_at?: string
    description?: string
    verified?: boolean
    public_metrics?: MetricBag
  }
}

export type XInsightsRange = '30d' | '90d' | '365d' | 'all'

export type XInsightPost = {
  id: string
  url: string
  text: string
  createdAt: string
  imageUrl: string | null
  impressions: number
  likes: number
  replies: number
  reposts: number
  quotes: number
  bookmarks: number
  engagements: number
  engagementRate: number
  weightedRate: number
  score: number
  confidence: 'مرتفعة' | 'متوسطة' | 'محدودة'
  verdict: string
}

export type XInsights = {
  connection: Awaited<ReturnType<typeof getXConnection>>
  account: XAccountResponse['data'] | null
  posts: XInsightPost[]
  summary: {
    accountScore: number
    totalPosts: number
    totalImpressions: number
    totalEngagements: number
    engagementRate: number
    averageScore: number
    recentTrend: number
    scoredPosts: number
  }
  topPosts: XInsightPost[]
  needsSync: boolean
  lastCapturedAt: string | null
}

const WEIGHTS = {
  like: 0.5,
  reply: 5,
  repost: 1,
  quote: 5,
  bookmark: 2,
} as const

function numberMetric(metrics: MetricBag | null | undefined, key: string) {
  const value = Number(metrics?.[key] ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function percentile(value: number, values: number[]) {
  if (values.length <= 1) return 0.5
  let below = 0
  let equal = 0
  for (const candidate of values) {
    if (candidate < value) below++
    else if (candidate === value) equal++
  }
  return (below + equal * 0.5) / values.length
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)))
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function dateCutoff(range: XInsightsRange) {
  if (range === 'all') return null
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function confidenceFor(impressions: number): XInsightPost['confidence'] {
  if (impressions >= 1_000) return 'مرتفعة'
  if (impressions >= 200) return 'متوسطة'
  return 'محدودة'
}

function verdictFor(score: number, weightedRate: number, conversationRate: number) {
  if (score >= 80 && conversationRate >= 2) return 'انتشار قوي ونقاش نوعي'
  if (score >= 70) return 'أداء قوي مقابل تاريخ الحساب'
  if (score >= 55 && weightedRate > 0) return 'أداء جيد قابل للتكرار'
  if (score >= 40) return 'أداء متوسط يحتاج تحسين الخطاف'
  return 'أداء ضعيف مقارنة بالمنشورات المشابهة'
}

async function loadStoredPosts() {
  const service = await createServiceRoleClient()
  const rows: StoredXPost[] = []
  const pageSize = 1_000

  for (let from = 0; from < 5_000; from += pageSize) {
    const { data, error } = await service
      .from('first1_x_archive_posts')
      .select('x_post_id,post_url,post_text,created_at_x,updated_at,image_url,public_metrics,raw')
      .order('created_at_x', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`تعذّر تحميل بيانات تحليلات X: ${error.message}`)
    const batch = (data ?? []) as StoredXPost[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
}

function scorePosts(rows: StoredXPost[]): XInsightPost[] {
  const base = rows.map(row => {
    const metrics = row.public_metrics ?? {}
    const impressions = numberMetric(metrics, 'impression_count')
    const likes = numberMetric(metrics, 'like_count')
    const replies = numberMetric(metrics, 'reply_count')
    const reposts = numberMetric(metrics, 'retweet_count')
    const quotes = numberMetric(metrics, 'quote_count')
    const bookmarks = numberMetric(metrics, 'bookmark_count')
    const engagements = likes + replies + reposts + quotes + bookmarks
    const denominator = Math.max(impressions, 1)
    const weightedValue = likes * WEIGHTS.like
      + replies * WEIGHTS.reply
      + reposts * WEIGHTS.repost
      + quotes * WEIGHTS.quote
      + bookmarks * WEIGHTS.bookmark
    return {
      row,
      impressions,
      likes,
      replies,
      reposts,
      quotes,
      bookmarks,
      engagements,
      engagementRate: impressions ? engagements / impressions * 100 : 0,
      weightedRate: impressions ? weightedValue / denominator * 1_000 : weightedValue,
      conversationRate: impressions ? (replies + quotes) / denominator * 1_000 : replies + quotes,
      amplificationRate: impressions ? (reposts + quotes + bookmarks) / denominator * 1_000 : reposts + quotes + bookmarks,
    }
  })

  const comparable = base.filter(post => post.impressions > 0)
  const weightedRates = comparable.map(post => post.weightedRate)
  const conversationRates = comparable.map(post => post.conversationRate)
  const amplificationRates = comparable.map(post => post.amplificationRate)
  const reaches = comparable.map(post => Math.log10(post.impressions + 1))

  return base.map(post => {
    const rawScore = post.impressions > 0
      ? 100 * (
          0.4 * percentile(post.weightedRate, weightedRates)
          + 0.25 * percentile(post.conversationRate, conversationRates)
          + 0.2 * percentile(post.amplificationRate, amplificationRates)
          + 0.15 * percentile(Math.log10(post.impressions + 1), reaches)
        )
      : 50
    const reliability = post.impressions >= 1_000 ? 1 : post.impressions >= 200 ? 0.8 : 0.55
    const score = Math.round(50 + (rawScore - 50) * reliability)
    return {
      id: post.row.x_post_id,
      url: post.row.post_url,
      text: post.row.post_text,
      createdAt: post.row.created_at_x,
      imageUrl: post.row.image_url,
      impressions: post.impressions,
      likes: post.likes,
      replies: post.replies,
      reposts: post.reposts,
      quotes: post.quotes,
      bookmarks: post.bookmarks,
      engagements: post.engagements,
      engagementRate: round(post.engagementRate, 2),
      weightedRate: round(post.weightedRate, 2),
      score,
      confidence: confidenceFor(post.impressions),
      verdict: verdictFor(score, post.weightedRate, post.conversationRate),
    }
  })
}

export async function getXInsights(range: XInsightsRange): Promise<XInsights> {
  const [connection, storedRows] = await Promise.all([getXConnection(), loadStoredPosts()])
  const cutoff = dateCutoff(range)
  const rows = cutoff
    ? storedRows.filter(row => new Date(row.created_at_x) >= cutoff)
    : storedRows
  const posts = scorePosts(rows)
  const scoredPosts = posts.filter(post => post.impressions > 0)
  const scores = scoredPosts.map(post => post.score)
  const recentScores = scores.slice(0, 20)
  const previousScores = scores.slice(20, 40)
  const recentAverage = mean(recentScores.length ? recentScores : scores)
  const previousAverage = mean(previousScores.length ? previousScores : scores)
  const recentTrend = round(recentAverage - previousAverage, 1)
  const consistency = Math.max(0, 100 - standardDeviation(recentScores.length ? recentScores : scores) * 2)
  const accountScore = scoredPosts.length
    ? Math.round(Math.max(0, Math.min(100, recentAverage * 0.75 + consistency * 0.25)))
    : 0
  const totalImpressions = posts.reduce((sum, post) => sum + post.impressions, 0)
  const totalEngagements = posts.reduce((sum, post) => sum + post.engagements, 0)
  let account: XAccountResponse['data'] | null = null

  if (connection) {
    try {
      account = (await xApiFetch<XAccountResponse>('/users/me?user.fields=created_at,description,verified,public_metrics')).data ?? null
    } catch {
      account = null
    }
  }

  const lastCapturedAt = storedRows
    .map(row => row.updated_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  const needsSync = !lastCapturedAt || Date.now() - new Date(lastCapturedAt).getTime() > 36 * 60 * 60 * 1000

  return {
    connection,
    account,
    posts,
    summary: {
      accountScore,
      totalPosts: posts.length,
      totalImpressions,
      totalEngagements,
      engagementRate: totalImpressions ? round(totalEngagements / totalImpressions * 100, 2) : 0,
      averageScore: round(mean(scores), 1),
      recentTrend,
      scoredPosts: scoredPosts.length,
    },
    topPosts: [...posts].filter(post => post.impressions > 0).sort((a, b) => b.score - a.score).slice(0, 5),
    needsSync,
    lastCapturedAt,
  }
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

/** Refreshes the current year's owned posts and captures their latest public metrics. */
export async function syncCurrentXInsights() {
  const service = await createServiceRoleClient()
  const { data: connection, error } = await service
    .from('x_oauth_tokens')
    .select('x_user_id,x_username')
    .eq('id', true)
    .maybeSingle()
  if (error || !connection?.x_user_id || !connection.x_username) throw new Error('حساب X غير متصل')

  const posts = new Map<string, XPost>()
  const mediaByKey = new Map<string, XMedia>()
  let nextToken: string | undefined
  const startTime = `${new Date().getUTCFullYear()}-01-01T00:00:00Z`

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      max_results: '100',
      start_time: startTime,
      exclude: 'replies,retweets',
      'tweet.fields': 'created_at,attachments,public_metrics',
      expansions: 'attachments.media_keys',
      'media.fields': 'media_key,type,url,preview_image_url,alt_text,public_metrics',
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

  const capturedAt = new Date().toISOString()
  const rows = [...posts.values()]
    .filter(post => post.text?.trim() && post.created_at)
    .map(post => {
      const media = (post.attachments?.media_keys ?? []).map(key => mediaByKey.get(key)).filter(Boolean)
      return {
        x_post_id: post.id,
        post_url: `https://x.com/${connection.x_username}/status/${post.id}`,
        post_text: post.text!.trim(),
        created_at_x: post.created_at,
        image_url: firstImage(post, mediaByKey),
        media,
        public_metrics: post.public_metrics ?? {},
        raw: { ...post, analytics_captured_at: capturedAt },
        imported_at: capturedAt,
        updated_at: capturedAt,
      }
    })

  if (rows.length) {
    const { error: upsertError } = await service
      .from('first1_x_archive_posts')
      .upsert(rows, { onConflict: 'x_post_id' })
    if (upsertError) throw new Error(`تعذّر حفظ تحليلات X: ${upsertError.message}`)

    const snapshots = [...posts.values()]
      .filter(post => post.created_at)
      .map(post => ({
        x_post_id: post.id,
        captured_at: capturedAt,
        post_age_hours: Math.max(0, Math.floor((new Date(capturedAt).getTime() - new Date(post.created_at!).getTime()) / 3_600_000)),
        public_metrics: post.public_metrics ?? {},
        non_public_metrics: post.non_public_metrics ?? {},
        organic_metrics: post.organic_metrics ?? {},
      }))
    const { error: snapshotError } = await service.from('x_post_metric_snapshots').insert(snapshots)
    if (snapshotError) throw new Error(`تعذّر حفظ لقطات أداء X: ${snapshotError.message}`)
  }

  let conversations = 0
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString()
    const params = new URLSearchParams({
      max_results: '100',
      start_time: since,
      'tweet.fields': 'created_at,author_id,referenced_tweets,public_metrics',
      expansions: 'author_id',
      'user.fields': 'username,name',
    })
    const mentions = await xApiFetch<XTimelineResponse>(`/users/${connection.x_user_id}/mentions?${params.toString()}`)
    const users = new Map((mentions.includes?.users ?? []).map(user => [user.id, user]))
    const conversationRows = (mentions.data ?? [])
      .filter(post => post.text?.trim() && post.created_at && post.author_id !== connection.x_user_id)
      .map(post => {
        const author = users.get(post.author_id ?? '')
        const reply = post.referenced_tweets?.find(reference => reference.type === 'replied_to')
        const quote = post.referenced_tweets?.find(reference => reference.type === 'quoted')
        return {
          x_post_id: post.id,
          conversation_type: reply ? 'reply' : quote ? 'quote' : 'mention',
          author_id: post.author_id ?? null,
          author_username: author?.username ?? null,
          author_name: author?.name ?? null,
          post_text: post.text!.trim(),
          post_url: `https://x.com/${author?.username ?? 'i'}/status/${post.id}`,
          referenced_post_id: reply?.id ?? quote?.id ?? null,
          public_metrics: post.public_metrics ?? {},
          detected_at: post.created_at,
          updated_at: capturedAt,
        }
      })
    if (conversationRows.length) {
      const { error: conversationError } = await service.from('x_growth_conversations').upsert(conversationRows, { onConflict: 'x_post_id' })
      if (conversationError) throw conversationError
      conversations = conversationRows.length
    }
  } catch {
    conversations = 0
  }

  return { synced: rows.length, conversations, capturedAt }
}
