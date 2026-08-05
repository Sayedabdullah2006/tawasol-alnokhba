import { createServiceRoleClient } from '@/lib/supabase-server'
import { xApiFetch, xApiRequest } from '@/lib/x-oauth'
import { chatComplete, getOpenAI } from '@/lib/openai'

type XTweet = { id: string; text: string; author_id?: string; conversation_id?: string; created_at?: string }
type XUser = { id: string; username?: string; name?: string; verified?: boolean }
type XSearch = { data?: XTweet[]; includes?: { users?: XUser[] }; meta?: { result_count?: number } }

const TOPIC_QUERY = '(ابتكار OR اختراع OR تقنية OR "بحث علمي" OR ريادة OR "إنجاز سعودي" OR "رؤية السعودية 2030") lang:ar -is:retweet'

function relevance(text: string, isReply: boolean) {
  const matches = ['ابتكار', 'اختراع', 'تقنية', 'بحث', 'ريادة', 'إنجاز', 'علم'].filter(word => text.includes(word)).length
  return Math.min(100, (isReply ? 65 : 45) + matches * 8)
}

async function search(query: string): Promise<XSearch> {
  const params = new URLSearchParams({
    query,
    max_results: '100',
    'tweet.fields': 'author_id,conversation_id,created_at',
    expansions: 'author_id',
    'user.fields': 'verified,username,name',
  })
  return xApiFetch<XSearch>(`/tweets/search/recent?${params.toString()}`)
}

function verifiedItems(result: XSearch, sourceType: 'verified_topic' | 'verified_reply_to_first1') {
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

export async function scanXRadar() {
  const service = await createServiceRoleClient()
  const { data: connection } = await service.from('x_oauth_tokens')
    .select('x_user_id,x_username').eq('id', true).maybeSingle()
  if (!connection?.x_user_id || !connection.x_username) throw new Error('X account is not connected')

  const ownPosts = await xApiFetch<{ data?: XTweet[] }>(`/users/${connection.x_user_id}/tweets?max_results=5&tweet.fields=created_at,conversation_id`)
  const replyResults = await Promise.all((ownPosts.data ?? []).map(post =>
    search(`conversation_id:${post.id} -from:${connection.x_username} -is:retweet`),
  ))
  const replies = replyResults.flatMap(result => verifiedItems(result, 'verified_reply_to_first1'))
  const topicResult = await search(TOPIC_QUERY)
  const topics = verifiedItems(topicResult, 'verified_topic')
  const rows = [...replies, ...topics]
  if (rows.length) {
    const { error } = await service.from('x_radar_items').upsert(rows, { onConflict: 'x_post_id', ignoreDuplicates: true })
    if (error) throw new Error(`Unable to save X radar items: ${error.message}`)
  }
  return {
    found: rows.length,
    verifiedReplies: replies.length,
    verifiedTopics: topics.length,
    scannedOwnPosts: ownPosts.data?.length ?? 0,
    matchingReplies: replyResults.reduce((total, result) => total + (result.meta?.result_count ?? result.data?.length ?? 0), 0),
    matchingTopics: topicResult.meta?.result_count ?? topicResult.data?.length ?? 0,
  }
}

export async function createRadarDraft(item: { post_text: string; source_type: string }) {
  const completion = await chatComplete(getOpenAI(), {
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.2',
    messages: [
      { role: 'system', content: 'Return JSON only with recommendation (reply, quote, ignore) and draft. You write for First1Saudi in concise, respectful Saudi Arabic. Add real value, do not use emojis or hashtags, never request engagement, and never make unverified claims. Recommend quote only for an independent substantive perspective. If unsuitable, return ignore with an empty draft.' },
      { role: 'user', content: `Source type: ${item.source_type}\nPost:\n${item.post_text}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
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
