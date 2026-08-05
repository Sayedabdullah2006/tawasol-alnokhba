import { createServiceRoleClient } from '@/lib/supabase-server'
import { xApiFetch, xApiRequest } from '@/lib/x-oauth'
import { chatComplete, getOpenAI } from '@/lib/openai'

type XTweet = { id: string; text: string; author_id?: string; conversation_id?: string; created_at?: string }
type XUser = { id: string; username?: string; name?: string; description?: string; location?: string; verified?: boolean }
type XSearch = { data?: XTweet[]; includes?: { users?: XUser[] }; meta?: { result_count?: number; next_token?: string } }

const DIRECT_SAUDI_ACHIEVEMENT_SIGNALS = ['اختراع سعودي', 'براءة اختراع سعودية', 'موهبة سعودية', 'رقم قياسي سعودي', 'السعودية موسوعة غينيس', 'بحمد الله حصلت على براءة اختراع', 'سعودي يحقق جائزة', 'عالم سعودي', 'عالمة سعودية']

function relevance(text: string, isReply: boolean) {
  const domainMatches = ['ابتكار', 'اختراع', 'تقنية', 'بحث', 'ريادة', 'إنجاز', 'علم', 'موهبة', 'مخترع', 'براءة'].filter(word => text.includes(word)).length
  const saudiContext = ['السعودية', 'سعودي', 'المملكة', 'رؤية 2030', 'ولي العهد', 'الملك سلمان'].some(word => text.includes(word))
  const directSaudiAchievement = hasSignal(text, DIRECT_SAUDI_ACHIEVEMENT_SIGNALS)
  if (directSaudiAchievement) return Math.min(100, 90 + domainMatches * 2)
  if (saudiContext && domainMatches) return Math.min(100, 82 + domainMatches * 3)
  if (isReply) return Math.min(100, 70 + domainMatches * 3)
  // General innovation posts are opportunities to connect readers with Saudi achievers,
  // but they must never be presented as direct First1Saudi coverage.
  return Math.min(78, 52 + domainMatches * 6)
}

async function getMentions(userId: string, startTime: string, pages = 3): Promise<XSearch> {
  const posts = new Map<string, XTweet>()
  const users = new Map<string, XUser>()
  let resultCount = 0
  let nextToken: string | undefined

  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({
      max_results: '100',
      start_time: startTime,
      'tweet.fields': 'author_id,conversation_id,created_at',
      expansions: 'author_id',
      'user.fields': 'verified,username,name,description,location',
    })
    if (nextToken) params.set('pagination_token', nextToken)
    const result = await xApiFetch<XSearch>(`/users/${userId}/mentions?${params.toString()}`)
    for (const post of result.data ?? []) posts.set(post.id, post)
    for (const user of result.includes?.users ?? []) users.set(user.id, user)
    resultCount += result.meta?.result_count ?? result.data?.length ?? 0
    nextToken = result.meta?.next_token
    if (!nextToken) break
  }

  return { data: [...posts.values()], includes: { users: [...users.values()] }, meta: { result_count: resultCount, next_token: nextToken } }
}

function verifiedItems(result: XSearch, sourceType: 'verified_reply_to_first1') {
  const users = new Map((result.includes?.users ?? []).map(user => [user.id, user]))
  return (result.data ?? []).flatMap(tweet => {
    const author = tweet.author_id ? users.get(tweet.author_id) : undefined
    if (!author?.verified) return []
    return [{
      x_post_id: tweet.id,
      source_type: sourceType,
      parent_post_id: sourceType === 'verified_reply_to_first1' ? tweet.conversation_id ?? null : null,
      author_id: author.id,
      author_username: author.username ?? null,
      author_name: author.name ?? null,
      author_verified: true,
      post_text: tweet.text,
      post_url: `https://x.com/${author.username ?? 'i'}/status/${tweet.id}`,
      posted_at: tweet.created_at ?? null,
      relevance_score: relevance(tweet.text, sourceType === 'verified_reply_to_first1'),
      recommendation: sourceType === 'verified_reply_to_first1' ? 'reply' : 'ignore',
      scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]
  })
}

function hasSignal(text: string, signals: string[]) {
  return signals.some(signal => text.includes(signal))
}

export async function scanXRadar(trigger: 'manual' | 'scheduled' = 'scheduled') {
  const service = await createServiceRoleClient()
  const { data: connection } = await service.from('x_oauth_tokens')
    .select('x_user_id,x_username').eq('id', true).maybeSingle()
  if (!connection?.x_user_id || !connection.x_username) throw new Error('X account is not connected')

  const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const endTime = new Date().toISOString()
  const mentionResult = await getMentions(connection.x_user_id, startTime)
  const replies = verifiedItems(mentionResult, 'verified_reply_to_first1')
  const rows = replies

  const summary = {
    verifiedReplies: replies.length,
    verifiedTopics: 0,
    verifiedGovernmentPosts: 0,
    eligibleCabinetPosts: 0,
    scannedOwnPosts: 0,
    matchingReplies: mentionResult.meta?.result_count ?? mentionResult.data?.length ?? 0,
    matchingMentions: mentionResult.meta?.result_count ?? mentionResult.data?.length ?? 0,
    matchingTopics: 0,
    matchingSaudiAchievements: 0,
    matchingSaudiKnowledge: 0,
    matchingGovernmentPosts: 0,
    matchingCabinetPosts: 0,
  }
  const { data: scan, error: scanError } = await service.from('x_radar_scans').insert({
    trigger,
    window_start: startTime,
    window_end: endTime,
    found: rows.length,
    stats: summary,
  }).select('id').single()
  if (scanError || !scan) throw new Error(`Unable to save X radar scan: ${scanError?.message ?? 'unknown error'}`)

  if (rows.length) {
    const { data: savedItems, error } = await service.from('x_radar_items').upsert(
      rows.map(row => ({ ...row, last_seen_scan_id: scan.id })),
      { onConflict: 'x_post_id' },
    ).select('id,x_post_id')
    if (error) throw new Error(`Unable to save X radar items: ${error.message}`)
    const savedIds = new Map((savedItems ?? []).map(item => [item.x_post_id, item.id]))
    const { error: snapshotError } = await service.from('x_radar_scan_items').insert(rows.map(row => ({
      scan_id: scan.id,
      radar_item_id: savedIds.get(row.x_post_id) ?? null,
      x_post_id: row.x_post_id,
      source_type: row.source_type,
      author_username: row.author_username,
      author_name: row.author_name,
      post_text: row.post_text,
      post_url: row.post_url,
      relevance_score: row.relevance_score,
    })))
    if (snapshotError) throw new Error(`Unable to save X radar history: ${snapshotError.message}`)
  }
  return {
    found: rows.length,
    scanId: scan.id,
    ...summary,
  }
}

export async function createRadarDraft(item: { post_text: string; source_type: string; relevance_score?: number }) {
  const completion = await chatComplete(getOpenAI(), {
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.2',
    messages: [
      { role: 'system', content: 'Return JSON only with recommendation (reply) and draft. Every input is a verified mention of First1Saudi and has already passed relevance and safety filters, so always return a non-empty draft with recommendation reply. You write Arabic for First1Saudi, an official Saudi account focused on achievers, inventors, innovation, science, technology, research, entrepreneurship, and national accomplishments. The voice is formal, warm, confident, proud, and concise. It must sound like a thoughtful official social-media editor, never like a casual personal account or a press release. Write one or two short Arabic sentences, maximum 240 characters. Do not summarize, paraphrase, or repeat the source post. Before writing, identify one fresh editorial angle that the source supports: the future opportunity, the human outcome, the scientific meaning, the value of collaboration, or the path it opens for Saudi talent. Lead with that angle, then use at most one concrete source detail only when it strengthens the point. Do not repeat the source names, date, location, participating entities, or statistics unless they are essential to the new angle. Use substantially different wording from the source; never reuse a full phrase or make the draft read like a shortened news announcement. Favor clear active language and a calm, polished rhythm. Do not use colloquial Saudi expressions, emojis, hashtags, calls to engage, rhetorical questions, exaggerated praise, or generic filler. Avoid formulaic AI and institutional phrases, including equivalents of "reflects the impact", "important lever", "national model", "continuous improvement", "ecosystem", "empowerment", or "is considered". Never make unverified claims, comparisons, or claims of causation. Never use sarcasm, superiority, mockery, or unsupported comparison. Never write about politics, sectarianism, conflicts, wars, or controversy.' },
      { role: 'user', content: `Source type: ${item.source_type}\nRelevance score: ${item.relevance_score ?? 0}\nPost:\n${item.post_text}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.65,
  })
  try {
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { draft?: unknown; recommendation?: unknown }
    const draft = typeof parsed.draft === 'string' ? parsed.draft.trim() : ''
    if (!draft) throw new Error('لم يتم توليد مسودة قابلة للمراجعة')
    return { draft, recommendation: 'reply' as const }
  } catch {
    throw new Error('تعذر توليد مسودة قابلة للمراجعة')
  }
}

export async function publishRadarDraft(item: { x_post_id: string; draft_text: string; recommendation: string }) {
  const text = item.draft_text.trim()
  if (!text) throw new Error('اكتب مسودة قبل النشر')
  if (!['reply', 'quote'].includes(item.recommendation)) throw new Error('اختر رداً أو اقتباساً قبل النشر')

  const body = item.recommendation === 'quote'
    ? { text, quote_tweet_id: item.x_post_id }
    : { text, reply: { in_reply_to_tweet_id: item.x_post_id } }
  return xApiRequest<{ data?: { id?: string } }>('/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
