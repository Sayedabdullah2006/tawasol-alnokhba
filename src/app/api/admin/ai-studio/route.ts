import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getOpenAI } from '@/lib/openai'
import {
  buildNewsText,
  analyzeNews,
  generateTweets,
  generateConcepts,
  generateDesign,
} from '@/lib/ai-studio'
import { logGeneratedDesign } from '@/lib/newsletter'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Step = 'analyze' | 'tweets' | 'concepts' | 'image'

/**
 * استوديو الذكاء الاصطناعي المستقل (بلا طلب) — عديم الحالة:
 * الواجهة تُمرّر مخرجات كل خطوة للتالية (لا تخزين في قاعدة البيانات).
 * منفصل تماماً عن /api/admin/ai-generate الخاص بالطلبات.
 */
export async function POST(req: Request) {
  // ── Admin auth ──
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: {
    step?: Step
    title?: string
    content?: string
    sourceImage?: string
    sourceImages?: string[]
    extraInfo?: string
    analysis?: unknown
    chosenConcept?: string
    note?: string
    hasVideo?: boolean
    videoOrientation?: 'landscape' | 'portrait'
    previousConcepts?: string[]
    preparedPrompt?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const { step, title, content, sourceImage, analysis, chosenConcept, note, extraInfo, hasVideo, preparedPrompt } = body
  if (!step) return NextResponse.json({ error: 'الخطوة مطلوبة' }, { status: 400 })
  const jobId = await startGenerationJob({ ownerId: user.id, scope: 'standalone', operation: step })
  const success = async (payload: Record<string, unknown>) => {
    await throwIfGenerationCancelled(jobId)
    await completeGenerationJob(jobId, payload)
    return NextResponse.json(payload)
  }

  // دعم اختيار أكثر من صورة مصدر (مع التوافق الخلفي لصورة مفردة).
  const sourceImages: string[] =
    Array.isArray(body.sourceImages) && body.sourceImages.length
      ? body.sourceImages.filter((u): u is string => typeof u === 'string' && !!u)
      : sourceImage
        ? [sourceImage]
        : []
  // معلومات إضافية يدخلها الأدمن قبل التحليل تُدمج مع نص الخبر.
  const newsText = buildNewsText({ title, content, extraInfo })

  let openai: OpenAI
  try { openai = getOpenAI() } catch {
    await failGenerationJob(jobId, new Error('مفتاح OpenAI غير مهيّأ'))
    return NextResponse.json({ error: 'مفتاح OpenAI غير مهيّأ — أضِفه في إعدادات الخادم' }, { status: 500 })
  }

  try {
    // ── analyze ──
    if (step === 'analyze') {
      const parsed = await analyzeNews(openai, { newsText, sourceImages })
      return success({ analysis: parsed })
    }

    // ── tweets ──
    if (step === 'tweets') {
      if (!analysis) { await failGenerationJob(jobId, new Error('حلّل الخبر أولاً')); return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 }) }
      const tweets = await generateTweets(openai, { analysis, newsText })
      return success({ tweets })
    }

    // ── concepts ──
    if (step === 'concepts') {
      if (!analysis) { await failGenerationJob(jobId, new Error('حلّل الخبر أولاً')); return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 }) }
      const excludeTitles = Array.isArray(body.previousConcepts) ? body.previousConcepts : []
      const items = await generateConcepts(openai, { analysis, newsText, sourceImages, excludeTitles, hasVideo, videoOrientation: body.videoOrientation })
      return success({ concepts: items })
    }

    // ── image ──
    if (step === 'image') {
      if (!analysis) { await failGenerationJob(jobId, new Error('حلّل الخبر أولاً')); return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 }) }
      if (!chosenConcept) { await failGenerationJob(jobId, new Error('اختر اتجاه التصميم أولاً')); return NextResponse.json({ error: 'اختر اتجاه التصميم أولاً' }, { status: 400 }) }
      if (!sourceImages.length) { await failGenerationJob(jobId, new Error('ارفع صورة المصدر أولاً')); return NextResponse.json({ error: 'ارفع صورة المصدر أولاً' }, { status: 400 }) }

      const { imageUrl, prompt } = await generateDesign(openai, { analysis, chosenConcept, sourceImages, note, hasVideo, videoOrientation: body.videoOrientation, preparedPrompt: typeof preparedPrompt === 'string' ? preparedPrompt : undefined })
      // تسجيل التصميم في السجلّ الموحّد (مرشّحي نشرة «النخبة في ٧»)
      await logGeneratedDesign({
        source: 'standalone',
        title: title ?? null,
        content: content ?? null,
        category: null,
        imageUrl,
        sourceImageUrl: sourceImages[0] ?? null,
      })
      return success({ imageUrl, prompt })
    }

    await failGenerationJob(jobId, new Error('خطوة غير معروفة'))
    return NextResponse.json({ error: 'خطوة غير معروفة' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف'
    await failGenerationJob(jobId, err)
    return NextResponse.json({ error: `فشل توليد الذكاء الاصطناعي: ${message}` }, { status: 500 })
  }
}
