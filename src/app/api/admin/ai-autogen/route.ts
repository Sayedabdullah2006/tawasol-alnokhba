import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS } from '@/lib/openai'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OPENAI_MODEL = 'gpt-5.5'

// يولّد الخطوات 1-3 (تحليل + تغريدات + اتجاهات) لنصّ خبر واحد
async function generateSteps(
  openai: OpenAI,
  newsText: string,
  sourceImage?: string,
): Promise<{
  analysis: unknown
  tweets: string
  conceptsRaw: string
  conceptItems: Array<{ title?: string; mood?: string; brief?: string }>
}> {
  // 1) تحليل الخبر (مع الصورة إن وُجدت)
  const analyzeContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: newsText },
  ]
  if (sourceImage) analyzeContent.push({ type: 'image_url', image_url: { url: sourceImage } })

  const a = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYS_ANALYZE },
      { role: 'user', content: analyzeContent },
    ],
  })
  const aRaw = a.choices[0]?.message?.content ?? '{}'
  let analysis: unknown
  try { analysis = JSON.parse(aRaw) } catch { analysis = { raw: aRaw } }

  // 2) التغريدات
  const t = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYS_TWEETS },
      { role: 'user', content: `${JSON.stringify(analysis)}\n\n${newsText}` },
    ],
  })
  const tweets = t.choices[0]?.message?.content ?? ''

  // 3) اتجاهات التصميم (مع الصورة لتراعي تكوينها)
  const conceptContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: `${JSON.stringify(analysis)}\n\n${newsText}` },
  ]
  if (sourceImage) conceptContent.push({ type: 'image_url', image_url: { url: sourceImage } })

  const c = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYS_CONCEPTS },
      { role: 'user', content: conceptContent },
    ],
  })
  const conceptsRaw = c.choices[0]?.message?.content ?? '{}'
  let conceptItems: Array<{ title?: string; mood?: string; brief?: string }> = []
  try {
    const parsed = JSON.parse(conceptsRaw)
    if (Array.isArray(parsed?.concepts)) conceptItems = parsed.concepts
    else if (Array.isArray(parsed)) conceptItems = parsed
  } catch { conceptItems = [] }

  return { analysis, tweets, conceptsRaw, conceptItems }
}

export async function POST(req: Request) {
  // ── Admin auth ──
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { requestId?: string; force?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  const { requestId, force } = body
  if (!requestId) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: reqRow, error: loadErr } = await service
    .from('publish_requests').select('*').eq('id', requestId).single()
  if (loadErr || !reqRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

  // يُسمح بالتوليد في مرحلة الدفع/التنفيذ فقط
  if (!['paid', 'in_progress'].includes(reqRow.status)) {
    return NextResponse.json({ error: 'التوليد التلقائي متاح بعد الدفع' }, { status: 400 })
  }

  let openai: OpenAI
  try { openai = getOpenAI() } catch {
    // لا نُفشل الطلب بصرياً؛ نُعلّم المحاولة حتى لا تتكرر بلا فائدة
    await service.from('publish_requests').update({ ai_autogen_at: new Date().toISOString() }).eq('id', requestId)
    return NextResponse.json({ error: 'مفتاح OpenAI غير مهيّأ' }, { status: 500 })
  }

  try {
    const isCampaign = reqRow.request_type === 'campaign' && Array.isArray(reqRow.campaign_posts) && reqRow.campaign_posts.length > 0

    if (isCampaign) {
      const posts = reqRow.campaign_posts as any[]
      const aiPosts: Record<string, any> =
        reqRow.ai_posts && typeof reqRow.ai_posts === 'object' ? { ...reqRow.ai_posts } : {}

      for (let idx = 0; idx < posts.length; idx++) {
        if (!force && aiPosts[idx]?.analysis) continue // متولّد سابقاً
        const post = posts[idx]
        const newsText = `العنوان: ${post?.title ?? ''}\nالمحتوى: ${post?.content ?? ''}`
        const src = Array.isArray(post?.images) && post.images.length > 0 ? post.images[0] : undefined
        const r = await generateSteps(openai, newsText, src)
        aiPosts[idx] = {
          ...(aiPosts[idx] ?? {}),
          analysis: r.analysis,
          source_image: src ?? null,
          tweets: { raw: r.tweets },
          design_concepts: { items: r.conceptItems, raw: r.conceptsRaw },
        }
      }

      const { error } = await service
        .from('publish_requests')
        .update({ ai_posts: aiPosts, ai_autogen_at: new Date().toISOString() })
        .eq('id', requestId)
      if (error) throw new Error(error.message)
    } else {
      if (force || !reqRow.ai_analysis) {
        const newsText = `العنوان: ${reqRow.title ?? ''}\nالمحتوى: ${reqRow.content ?? ''}`
        const src = Array.isArray(reqRow.content_images) && reqRow.content_images.length > 0
          ? reqRow.content_images[0] : undefined
        const r = await generateSteps(openai, newsText, src)
        const { error } = await service
          .from('publish_requests')
          .update({
            ai_analysis: r.analysis,
            ai_source_image: src ?? null,
            ai_tweets: { raw: r.tweets },
            ai_design_concepts: { items: r.conceptItems, raw: r.conceptsRaw },
            ai_autogen_at: new Date().toISOString(),
          })
          .eq('id', requestId)
        if (error) throw new Error(error.message)
      } else {
        await service.from('publish_requests').update({ ai_autogen_at: new Date().toISOString() }).eq('id', requestId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف'
    return NextResponse.json({ error: `فشل التوليد التلقائي: ${message}` }, { status: 500 })
  }
}
