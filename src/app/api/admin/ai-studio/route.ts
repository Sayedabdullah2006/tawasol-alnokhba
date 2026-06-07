import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, SYS_IMAGE } from '@/lib/openai'
import { generateImageWithGemini } from '@/lib/gemini'
import { compositeLogoBottomRight, resizeToPoster } from '@/lib/logo-overlay'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OPENAI_MODEL = 'gpt-5.5'

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
    analysis?: unknown
    chosenConcept?: string
    note?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const { step, title, content, sourceImage, analysis, chosenConcept, note } = body
  if (!step) return NextResponse.json({ error: 'الخطوة مطلوبة' }, { status: 400 })

  const newsText = `العنوان: ${title ?? ''}\nالمحتوى: ${content ?? ''}`

  let openai: OpenAI
  try { openai = getOpenAI() } catch {
    return NextResponse.json({ error: 'مفتاح OpenAI غير مهيّأ — أضِفه في إعدادات الخادم' }, { status: 500 })
  }

  try {
    // ── analyze ──
    if (step === 'analyze') {
      const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: newsText }]
      if (sourceImage) userContent.push({ type: 'image_url', image_url: { url: sourceImage } })
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYS_ANALYZE }, { role: 'user', content: userContent }],
      })
      const raw = completion.choices[0]?.message?.content ?? '{}'
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { parsed = { raw } }
      return NextResponse.json({ analysis: parsed })
    }

    // ── tweets ──
    if (step === 'tweets') {
      if (!analysis) return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYS_TWEETS },
          { role: 'user', content: `${JSON.stringify(analysis)}\n\n${newsText}` },
        ],
      })
      return NextResponse.json({ tweets: completion.choices[0]?.message?.content ?? '' })
    }

    // ── concepts ──
    if (step === 'concepts') {
      if (!analysis) return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      const conceptContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: `${JSON.stringify(analysis)}\n\n${newsText}` },
      ]
      if (sourceImage) conceptContent.push({ type: 'image_url', image_url: { url: sourceImage } })
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYS_CONCEPTS }, { role: 'user', content: conceptContent }],
      })
      const raw = completion.choices[0]?.message?.content ?? '{}'
      let items: Array<{ title?: string; mood?: string; brief?: string }> = []
      try {
        const p = JSON.parse(raw)
        if (Array.isArray(p?.concepts)) items = p.concepts
        else if (Array.isArray(p)) items = p
      } catch { items = [] }
      return NextResponse.json({ concepts: items })
    }

    // ── image ──
    if (step === 'image') {
      if (!analysis) return NextResponse.json({ error: 'حلّل الخبر أولاً' }, { status: 400 })
      if (!chosenConcept) return NextResponse.json({ error: 'اختر اتجاه التصميم أولاً' }, { status: 400 })
      if (!sourceImage) return NextResponse.json({ error: 'ارفع صورة المصدر أولاً' }, { status: 400 })

      const service = await createServiceRoleClient()
      const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
      const logoUrl: string | null = brand?.first1saudi_logo_url ?? null

      const promptCompletion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYS_IMAGE },
          {
            role: 'user',
            content:
              `بيانات الخبر (JSON):\n${JSON.stringify(analysis)}\n\n` +
              `الاتجاه المعتمد:\n${chosenConcept}\n\n` +
              `الصورة الحقيقية المرفقة هي على الرابط: ${sourceImage}\n` +
              `اترك مساحة فارغة أسفل يمين الفوتر للوقو (سيُضاف لاحقاً برمجياً) ولا ترسم أي شعار هناك.\n` +
              (note && note.trim()
                ? `\n‼️ ملاحظات الأدمن على التصميم (طبّقها بدقّة مع الحفاظ على ثوابت الهوية والصورة الحقيقية): ${note.trim()}\n`
                : ''),
          },
        ],
      })
      const designPrompt = promptCompletion.choices[0]?.message?.content ?? ''

      const { b64 } = await generateImageWithGemini(designPrompt, [sourceImage])
      const rawImage = Buffer.from(b64, 'base64')
      const posterBase = await resizeToPoster(rawImage)
      const { buffer: finalImage, mimeType } = logoUrl
        ? await compositeLogoBottomRight(posterBase, logoUrl)
        : { buffer: posterBase, mimeType: 'image/png' }

      const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
      const path = `studio-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await service.storage.from('content-images').upload(path, finalImage, { contentType: mimeType })
      if (upErr) throw new Error(`فشل رفع الصورة: ${upErr.message}`)
      const { data: pub } = service.storage.from('content-images').getPublicUrl(path)

      return NextResponse.json({ imageUrl: pub.publicUrl, prompt: designPrompt })
    }

    return NextResponse.json({ error: 'خطوة غير معروفة' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف'
    return NextResponse.json({ error: `فشل توليد الذكاء الاصطناعي: ${message}` }, { status: 500 })
  }
}
