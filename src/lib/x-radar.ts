import { createServiceRoleClient } from '@/lib/supabase-server'
import { xApiFetch, xApiRequest } from '@/lib/x-oauth'
import { chatComplete, getOpenAI } from '@/lib/openai'

type XTweet = { id: string; text: string; author_id?: string; conversation_id?: string; created_at?: string }
type XUser = { id: string; username?: string; name?: string; description?: string; location?: string; verified?: boolean }
type XSearch = { data?: XTweet[]; includes?: { users?: XUser[] }; meta?: { result_count?: number } }

const TOPIC_QUERY = '(ابتكار OR اختراع OR تقنية OR "بحث علمي" OR ريادة OR "إنجاز سعودي" OR "رؤية السعودية 2030") lang:ar -is:retweet'
const CABINET_QUERY = 'from:spagov -is:retweet'
const SAUDI_CONTEXT_SIGNALS = ['السعودية', 'سعودي', 'سعودية', 'المملكة', 'رؤية 2030', 'أول سعودي', 'أول سعودية']
const FIRST1_FOCUS_SIGNALS = ['ابتكار', 'اختراع', 'براءة', 'مخترع', 'مخترعة', 'إبداع', 'صناعة', 'بحث علمي', 'باحث', 'باحثة', 'تقنية', 'علوم', 'ريادة', 'ريادي', 'ريادية', 'موهبة', 'جائزة', 'ميدالية']
const ACHIEVEMENT_SIGNALS = ['حقق', 'حققت', 'إنجاز', 'نجاح', 'فاز', 'فازت', 'حصل', 'حصلت', 'تتويج', 'تصنيف', 'مركز', 'الأول', 'الأولى', 'تميز', 'ريادة', 'تدشين']
const LEADERSHIP_SIGNALS = ['خادم الحرمين الشريفين', 'سمو ولي العهد', 'الأمير محمد بن سلمان', 'الملك سلمان']
const CABINET_EXCLUDED_SIGNALS = ['سياسي', 'سياسة', 'انتخابات', 'حرب', 'نزاع', 'صراع', 'دفاع', 'عسكري', 'أمنية', 'إرهاب', 'خارجية', 'فلسطين', 'إسرائيل', 'غزة', 'إيران', 'اليمن', 'سوريا', 'لبنان', 'العراق', 'إدانة', 'عقوبات', 'مجلس الأمن', 'طائفي', 'طائفية', 'مذهب', 'مذهبي', 'سني', 'شيعي', 'خلاف', 'جدل', 'احتجاج', 'اتهام']
const SAUDI_AUTHOR_SIGNALS = ['السعودية', 'السعودي', 'المملكة', 'saudi arabia', 'ksa']
const GOVERNMENT_AUTHOR_SIGNALS = ['الحساب الرسمي', 'جهة حكومية', 'وزارة', 'هيئة', 'المركز الوطني', 'برنامج', 'جامعة', 'مسؤول', 'وزير', 'معالي', 'سمو', 'government', 'official', 'ministry', 'authority']
const TRUSTED_SAUDI_ACCOUNTS = new Set(['spagov'])

function relevance(text: string, isReply: boolean) {
  const domainMatches = ['ابتكار', 'اختراع', 'تقنية', 'بحث', 'ريادة', 'إنجاز', 'علم', 'موهبة', 'مخترع', 'براءة'].filter(word => text.includes(word)).length
  const saudiContext = ['السعودية', 'سعودي', 'المملكة', 'رؤية 2030', 'ولي العهد', 'الملك سلمان'].some(word => text.includes(word))
  if (saudiContext && domainMatches) return Math.min(100, 82 + domainMatches * 3)
  if (isReply) return Math.min(100, 70 + domainMatches * 3)
  // General innovation posts are opportunities to connect readers with Saudi achievers,
  // but they must never be presented as direct First1Saudi coverage.
  return Math.min(78, 52 + domainMatches * 6)
}

async function search(query: string, startTime: string): Promise<XSearch> {
  const params = new URLSearchParams({
    query,
    max_results: '100',
    start_time: startTime,
    'tweet.fields': 'author_id,conversation_id,created_at',
    expansions: 'author_id',
    'user.fields': 'verified,username,name,description,location',
  })
  return xApiFetch<XSearch>(`/tweets/search/recent?${params.toString()}`)
}

function isSaudiOrGovernmentAuthor(author: XUser) {
  if (TRUSTED_SAUDI_ACCOUNTS.has((author.username ?? '').toLowerCase())) return true
  const profile = `${author.name ?? ''} ${author.description ?? ''} ${author.location ?? ''}`.toLowerCase()
  return hasSignal(profile, SAUDI_AUTHOR_SIGNALS)
    || (hasSignal(profile, GOVERNMENT_AUTHOR_SIGNALS) && hasSignal(profile, ['الرياض', 'جدة', 'المملكة', 'saudi', 'ksa']))
}

function verifiedItems(result: XSearch, sourceType: 'verified_topic' | 'verified_reply_to_first1' | 'saudi_cabinet', requireSaudiAuthor = false) {
  const users = new Map((result.includes?.users ?? []).map(user => [user.id, user]))
  return (result.data ?? []).flatMap(tweet => {
    const author = tweet.author_id ? users.get(tweet.author_id) : undefined
    if (!author?.verified || (requireSaudiAuthor && !isSaudiOrGovernmentAuthor(author))) return []
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

function isEligibleTopicItem(text: string) {
  return hasSignal(text, SAUDI_CONTEXT_SIGNALS)
    && hasSignal(text, FIRST1_FOCUS_SIGNALS)
    && !hasSignal(text, CABINET_EXCLUDED_SIGNALS)
}

function isEligibleCabinetItem(text: string) {
  if (hasSignal(text, CABINET_EXCLUDED_SIGNALS)) return false
  const hasNationalAchievement = hasSignal(text, ACHIEVEMENT_SIGNALS)
  const hasAccountFocus = hasSignal(text, FIRST1_FOCUS_SIGNALS)
  const hasLeadershipLink = hasSignal(text, LEADERSHIP_SIGNALS)
  return hasNationalAchievement && (hasAccountFocus || hasLeadershipLink)
}

export async function scanXRadar(trigger: 'manual' | 'scheduled' = 'scheduled') {
  const service = await createServiceRoleClient()
  const { data: connection } = await service.from('x_oauth_tokens')
    .select('x_user_id,x_username').eq('id', true).maybeSingle()
  if (!connection?.x_user_id || !connection.x_username) throw new Error('X account is not connected')

  const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const endTime = new Date().toISOString()
  const ownPosts = await xApiFetch<{ data?: XTweet[] }>(`/users/${connection.x_user_id}/tweets?max_results=100&start_time=${encodeURIComponent(startTime)}&tweet.fields=created_at,conversation_id`)
  const ownPostIds = new Set((ownPosts.data ?? []).map(post => post.id))
  const replyResult = await search(`to:${connection.x_username} is:reply -from:${connection.x_username} -is:retweet`, startTime)
  const replies = verifiedItems(replyResult, 'verified_reply_to_first1')
    .filter(reply => reply.parent_post_id && ownPostIds.has(reply.parent_post_id))
  const topicResult = await search(TOPIC_QUERY, startTime)
  const topics = verifiedItems(topicResult, 'verified_topic', true)
    .filter(item => isEligibleTopicItem(item.post_text))
  const cabinetResult = await search(CABINET_QUERY, startTime)
  const cabinet = verifiedItems(cabinetResult, 'saudi_cabinet')
    .filter(item => isEligibleCabinetItem(item.post_text))
  const rows = [...replies, ...topics, ...cabinet]

  const summary = {
    verifiedReplies: replies.length,
    verifiedTopics: topics.length,
    eligibleCabinetPosts: cabinet.length,
    scannedOwnPosts: ownPosts.data?.length ?? 0,
    matchingReplies: replyResult.meta?.result_count ?? replyResult.data?.length ?? 0,
    matchingTopics: topicResult.meta?.result_count ?? topicResult.data?.length ?? 0,
    matchingCabinetPosts: cabinetResult.meta?.result_count ?? cabinetResult.data?.length ?? 0,
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
      { role: 'system', content: 'Return JSON only with recommendation (reply, quote, ignore) and draft. You write for First1Saudi as a real Saudi social-media editor: warm, proud, conversational and concise. The account focuses on Saudi achievers, inventors, innovation, science, technology, research, entrepreneurship and national accomplishments. Write one or two short natural sentences, maximum 240 Arabic characters. Start from one specific detail in the post and add a human observation; do not summarize the announcement or turn it into a formal press release. Avoid institutional AI phrases and abstractions such as "يعكس أثر", "رافعة مهمة", "نموذج وطني", "التحسين المستمر", "منظومة", "تمكين", and "تُعد". Prefer natural Saudi phrasing such as "الخبر يفتح النفس" or "هنا يبان الفرق" only when it genuinely fits, and vary the rhythm between drafts. Do not use emojis or hashtags, never request engagement, and never make unverified claims. Only interact when the post has a clear Saudi achievement, Saudi inventor or innovator, Saudi industry, Saudi patent, national accomplishment, First Saudi or First Saudi Woman angle, or a directly related response to First1Saudi. Do not write a generic bridge to Saudi innovation for an unrelated global invention. Never use sarcasm, superiority, mockery, or unsupported comparison. Recommend quote only for an independent substantive perspective. Never write about politics, sectarianism, conflicts, wars, or controversy. For Saudi Cabinet news, interact only when there is both a clear national achievement and a relevant First1Saudi focus or leadership-linked achievement. If unsuitable, return ignore with an empty draft.' },
      { role: 'user', content: `Source type: ${item.source_type}\nRelevance score: ${item.relevance_score ?? 0}\nPost:\n${item.post_text}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  })
  try {
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { draft?: unknown; recommendation?: unknown }
    const recommendation = ['reply', 'quote', 'ignore'].includes(String(parsed.recommendation))
      ? parsed.recommendation as 'reply' | 'quote' | 'ignore'
      : 'ignore'
    return { draft: typeof parsed.draft === 'string' ? parsed.draft.trim() : '', recommendation }
  } catch {
    return { draft: '', recommendation: 'ignore' as const }
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
