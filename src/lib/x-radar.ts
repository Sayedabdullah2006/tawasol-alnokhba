import { createServiceRoleClient } from '@/lib/supabase-server'
import { xApiFetch, xApiRequest } from '@/lib/x-oauth'
import { chatComplete, getOpenAI } from '@/lib/openai'

type XTweet = { id: string; text: string; author_id?: string; conversation_id?: string; created_at?: string }
type XUser = { id: string; username?: string; name?: string; description?: string; location?: string; verified?: boolean }
type XSearch = { data?: XTweet[]; includes?: { users?: XUser[] }; meta?: { result_count?: number } }

const TOPIC_QUERY = '(ابتكار OR اختراع OR تقنية OR "بحث علمي" OR ريادة OR "إنجاز سعودي" OR "رؤية السعودية 2030" OR "اختراع سعودي" OR "براءة اختراع سعودية" OR "موهبة سعودية" OR "رقم قياسي سعودي" OR "السعودية موسوعة غينيس" OR "سعودي يحقق جائزة" OR "عالم سعودي" OR "عالمة سعودية") lang:ar -is:retweet'
const SAUDI_ACHIEVEMENT_QUERY = '(السعودية OR سعودي OR سعودية OR المملكة OR سعوديون OR سعوديات) (حقق OR حققت OR فاز OR فازت OR جائزة OR ميدالية OR تتويج OR "براءة اختراع" OR "رقم قياسي" OR غينيس OR إنجاز) lang:ar -is:retweet'
const SAUDI_KNOWLEDGE_QUERY = '(السعودية OR سعودي OR سعودية OR المملكة OR سعوديون OR سعوديات) (باحث OR باحثة OR عالم OR عالمة OR مخترع OR مخترعة OR موهبة OR ابتكار OR إبداع OR تقنية OR علوم OR "بحث علمي" OR ريادة) lang:ar -is:retweet'
const CABINET_QUERY = 'from:spagov -is:retweet'
const GOVERNMENT_QUERY = '(from:SaudiRDI OR from:CST_KSA OR from:MCITspokesman OR from:SaudiNIIC OR from:KSAlmudaifer OR from:moe_gov_sa OR from:MOFKSA) -is:retweet'
const SAUDI_CONTEXT_SIGNALS = ['السعودية', 'سعودي', 'سعودية', 'المملكة', 'رؤية 2030', 'أول سعودي', 'أول سعودية']
const FIRST1_FOCUS_SIGNALS = ['ابتكار', 'اختراع', 'اختراع سعودي', 'براءة', 'براءة اختراع سعودية', 'مخترع', 'مخترعة', 'إبداع', 'صناعة', 'بحث علمي', 'باحث', 'باحثة', 'تقنية', 'علوم', 'ريادة', 'ريادي', 'ريادية', 'موهبة', 'موهبة سعودية', 'جائزة', 'ميدالية', 'رقم قياسي سعودي', 'موسوعة غينيس', 'السعودية موسوعة غينيس', 'عالم سعودي', 'عالمة سعودية', 'سعودي يحقق جائزة', 'سعوديات', 'سعوديون']
const DIRECT_SAUDI_ACHIEVEMENT_SIGNALS = ['اختراع سعودي', 'براءة اختراع سعودية', 'موهبة سعودية', 'رقم قياسي سعودي', 'السعودية موسوعة غينيس', 'بحمد الله حصلت على براءة اختراع', 'سعودي يحقق جائزة', 'عالم سعودي', 'عالمة سعودية']
const ACHIEVEMENT_SIGNALS = ['حقق', 'حققت', 'إنجاز', 'نجاح', 'فاز', 'فازت', 'حصل', 'حصلت', 'تتويج', 'تصنيف', 'مركز', 'الأول', 'الأولى', 'تميز', 'ريادة', 'تدشين']
const LEADERSHIP_SIGNALS = ['خادم الحرمين الشريفين', 'سمو ولي العهد', 'الأمير محمد بن سلمان', 'الملك سلمان']
const NATIONAL_IMPACT_SIGNALS = ['خدمة ضيوف الرحمن', 'الحج', 'العمرة', 'صندوق النقد الدولي', 'مرونة اقتصاد', 'اقتصاد المملكة', 'البنية التحتية', 'التخطيط المالي', 'التحول الرقمي', 'جودة الحياة']
const CABINET_EXCLUDED_SIGNALS = ['سياسي', 'سياسة', 'انتخابات', 'حرب', 'نزاع', 'صراع', 'دفاع', 'عسكري', 'أمنية', 'إرهاب', 'خارجية', 'فلسطين', 'إسرائيل', 'غزة', 'إيران', 'اليمن', 'سوريا', 'لبنان', 'العراق', 'إدانة', 'عقوبات', 'مجلس الأمن', 'طائفي', 'طائفية', 'مذهب', 'مذهبي', 'سني', 'شيعي', 'خلاف', 'جدل', 'احتجاج', 'اتهام']
const SAUDI_AUTHOR_SIGNALS = ['السعودية', 'السعودي', 'المملكة', 'saudi arabia', 'ksa']
const GOVERNMENT_AUTHOR_SIGNALS = ['الحساب الرسمي', 'جهة حكومية', 'وزارة', 'هيئة', 'المركز الوطني', 'برنامج', 'جامعة', 'مسؤول', 'وزير', 'معالي', 'سمو', 'government', 'official', 'ministry', 'authority']
const TRUSTED_SAUDI_ACCOUNTS = new Set(['spagov', 'saudirdi', 'cst_ksa', 'mcitspokesman', 'saudiniic', 'ksalmudaifer', 'moe_gov_sa', 'mofksa'])

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

function mergeSearchResults(...results: XSearch[]): XSearch {
  const posts = new Map<string, XTweet>()
  const users = new Map<string, XUser>()
  let resultCount = 0
  for (const result of results) {
    for (const post of result.data ?? []) posts.set(post.id, post)
    for (const user of result.includes?.users ?? []) users.set(user.id, user)
    resultCount += result.meta?.result_count ?? result.data?.length ?? 0
  }
  return { data: [...posts.values()], includes: { users: [...users.values()] }, meta: { result_count: resultCount } }
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

function isEligibleTopicItem(text: string, fromTrustedSaudiSource = false) {
  const directSaudiAchievement = hasSignal(text, DIRECT_SAUDI_ACHIEVEMENT_SIGNALS)
  return (fromTrustedSaudiSource || hasSignal(text, SAUDI_CONTEXT_SIGNALS) || directSaudiAchievement)
    && (hasSignal(text, FIRST1_FOCUS_SIGNALS) || directSaudiAchievement)
    && !hasSignal(text, CABINET_EXCLUDED_SIGNALS)
}

function isEligibleCabinetItem(text: string) {
  if (hasSignal(text, CABINET_EXCLUDED_SIGNALS)) return false
  const hasNationalAchievement = hasSignal(text, ACHIEVEMENT_SIGNALS)
  const hasAccountFocus = hasSignal(text, FIRST1_FOCUS_SIGNALS)
  const hasLeadershipLink = hasSignal(text, LEADERSHIP_SIGNALS)
  const hasNationalImpact = hasSignal(text, NATIONAL_IMPACT_SIGNALS)
  return hasNationalAchievement && (hasAccountFocus || hasLeadershipLink || hasNationalImpact)
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
  const [replyResult, topicResult, achievementResult, knowledgeResult, governmentResult, cabinetResult] = await Promise.all([
    search(`to:${connection.x_username} is:reply -from:${connection.x_username} -is:retweet`, startTime),
    search(TOPIC_QUERY, startTime),
    search(SAUDI_ACHIEVEMENT_QUERY, startTime),
    search(SAUDI_KNOWLEDGE_QUERY, startTime),
    search(GOVERNMENT_QUERY, startTime),
    search(CABINET_QUERY, startTime),
  ])
  const replies = verifiedItems(replyResult, 'verified_reply_to_first1')
    .filter(reply => reply.parent_post_id && ownPostIds.has(reply.parent_post_id))
  const topicCandidates = mergeSearchResults(topicResult, achievementResult, knowledgeResult)
  const topics = verifiedItems(topicCandidates, 'verified_topic')
    .filter(item => isEligibleTopicItem(item.post_text))
  const government = verifiedItems(governmentResult, 'verified_topic', true)
    .filter(item => isEligibleTopicItem(item.post_text, true))
  const cabinet = verifiedItems(cabinetResult, 'saudi_cabinet')
    .filter(item => isEligibleCabinetItem(item.post_text))
    .map(item => ({ ...item, relevance_score: Math.max(item.relevance_score, 86) }))
  const rows = Array.from(new Map(
    [...replies, ...topics, ...government, ...cabinet].map(row => [row.x_post_id, row]),
  ).values())

  const summary = {
    verifiedReplies: replies.length,
    verifiedTopics: topics.length,
    verifiedGovernmentPosts: government.length,
    eligibleCabinetPosts: cabinet.length,
    scannedOwnPosts: ownPosts.data?.length ?? 0,
    matchingReplies: replyResult.meta?.result_count ?? replyResult.data?.length ?? 0,
    matchingTopics: topicCandidates.meta?.result_count ?? topicCandidates.data?.length ?? 0,
    matchingSaudiAchievements: achievementResult.meta?.result_count ?? achievementResult.data?.length ?? 0,
    matchingSaudiKnowledge: knowledgeResult.meta?.result_count ?? knowledgeResult.data?.length ?? 0,
    matchingGovernmentPosts: governmentResult.meta?.result_count ?? governmentResult.data?.length ?? 0,
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
      { role: 'system', content: 'Return JSON only with recommendation (reply, quote, ignore) and draft. You write Arabic for First1Saudi, an official Saudi account focused on achievers, inventors, innovation, science, technology, research, entrepreneurship, and national accomplishments. The voice is formal, warm, confident, proud, and concise. It must sound like a thoughtful official social-media editor, never like a casual personal account or a press release. Write one or two short Arabic sentences, maximum 240 characters. Build the draft around a concrete, verified detail from the post, then state its meaningful human, national, scientific, or innovation-related impact only when the connection is genuinely supported. Favor clear active language and a calm, polished rhythm. For service-to-pilgrims news, focus on the tangible improvement in the guest journey and the sustained national effort, not a recap of the announcement. Do not use colloquial Saudi expressions, emojis, hashtags, calls to engage, rhetorical questions, exaggerated praise, or generic filler. Avoid formulaic AI and institutional phrases, including equivalents of "reflects the impact", "important lever", "national model", "continuous improvement", "ecosystem", "empowerment", or "is considered". Never make unverified claims, comparisons, or claims of causation. Only interact when the post has a clear Saudi achievement, Saudi inventor or innovator, Saudi industry, Saudi patent, national accomplishment, First Saudi or First Saudi Woman angle, or a directly related response to First1Saudi. Do not create a generic connection to Saudi innovation for an unrelated global invention. Never use sarcasm, superiority, mockery, or unsupported comparison. Recommend quote only when an independent substantive perspective adds value. Never write about politics, sectarianism, conflicts, wars, or controversy. For Saudi Cabinet news, only engage with verified national achievements in the economy, infrastructure, digital transformation, quality of life, or service to pilgrims when the draft can naturally and specifically connect the news to opportunity, innovation, service quality, or the people behind the work. If unsuitable, return ignore with an empty draft.' },
      { role: 'user', content: `Source type: ${item.source_type}\nRelevance score: ${item.relevance_score ?? 0}\nPost:\n${item.post_text}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.65,
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
