/**
 * استوديو الذكاء الاصطناعي — طبقة منطق قابلة لإعادة الاستخدام (headless).
 *
 * استُخرجت من /api/admin/ai-studio لتُستدعى من مكانين:
 *   1) راوت الأدمن التفاعلي (خطوة بخطوة).
 *   2) المُنسّق اليومي /api/cron/daily-social (تشغيل كامل بلا تدخّل بشري).
 *
 * نفس البرومبتات (SYS_*) ونفس النماذج — لا يوجد سلوك مختلف عن الواجهة.
 */
import OpenAI from 'openai'
import { getOpenAI, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, SYS_IMAGE } from './openai'
import { generateImageWithGemini } from './gemini'
import { compositeLogoBottomRight, resizeToPoster } from './logo-overlay'
import { createServiceRoleClient } from './supabase-server'

export const OPENAI_MODEL = 'gpt-5.5'

/**
 * توجيه "الصياغة الدائمة" — يُحقَن في الأتمتة (إعادة نشر الأرشيف) فقط.
 * يمنع أي إيحاء بأن الخبر حدثٌ آنيّ/عاجل، لأن الخبر قد يكون قديماً.
 */
export const EVERGREEN_NOTE =
  '‼️ مهم — صياغة دائمة (إعادة نشر من الأرشيف): هذا المحتوى يُعاد نشره وقد يكون الخبر قديماً. ' +
  'اكتب بأسلوب دائم يُبرز الإنجاز كقيمة ومصدر فخر مستمر، ولا توحِ إطلاقاً بأنه حدثٌ وقع الآن أو خبرٌ عاجل. ' +
  'تجنّب تماماً كلمات الزمن الآني مثل: (اليوم، الآن، للتو، مؤخراً، أمس، هذا الأسبوع، حديثاً، أعلن اليوم، عاجل، خبر عاجل، تزامناً مع). ' +
  'لا تذكر تاريخاً أو فترة توحي بأن الحدث جديد. ركّز على الإنجاز نفسه وقيمته لا على توقيت وقوعه.'

export interface Concept {
  title?: string
  mood?: string
  brief?: string
}

/** يبني نص الخبر الموحّد الذي يُمرَّر لكل الخطوات (مع المعلومات الإضافية إن وُجدت). */
export function buildNewsText(args: { title?: string; content?: string; extraInfo?: string }): string {
  const extraInfoText =
    typeof args.extraInfo === 'string' && args.extraInfo.trim()
      ? `\n\nمعلومات إضافية من الأدمن (راعِها في التحليل والاتجاهات والتصميم):\n${args.extraInfo.trim()}`
      : ''
  return `العنوان: ${args.title ?? ''}\nالمحتوى: ${args.content ?? ''}${extraInfoText}`
}

/** الخطوة 1 — تحليل الخبر إلى JSON. */
export async function analyzeNews(
  openai: OpenAI,
  args: { newsText: string; sourceImages: string[] },
): Promise<unknown> {
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: args.newsText }]
  for (const img of args.sourceImages) userContent.push({ type: 'image_url', image_url: { url: img } })
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYS_ANALYZE }, { role: 'user', content: userContent }],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  try { return JSON.parse(raw) } catch { return { raw } }
}

/** الخطوة 2 — توليد 3 تغريدات (نص مرقّم). `extra` تعليمات إضافية اختيارية. */
export async function generateTweets(
  openai: OpenAI,
  args: { analysis: unknown; newsText: string; extra?: string },
): Promise<string> {
  const user =
    `${JSON.stringify(args.analysis)}\n\n${args.newsText}` +
    (args.extra ? `\n\n${args.extra}` : '')
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYS_TWEETS },
      { role: 'user', content: user },
    ],
  })
  return completion.choices[0]?.message?.content ?? ''
}

/** الخطوة 3 — اقتراح 3 اتجاهات تصميم. */
export async function generateConcepts(
  openai: OpenAI,
  args: { analysis: unknown; newsText: string; sourceImages: string[] },
): Promise<Concept[]> {
  const conceptContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: `${JSON.stringify(args.analysis)}\n\n${args.newsText}` },
  ]
  for (const img of args.sourceImages) conceptContent.push({ type: 'image_url', image_url: { url: img } })
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYS_CONCEPTS }, { role: 'user', content: conceptContent }],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p?.concepts)) return p.concepts
    if (Array.isArray(p)) return p
  } catch { /* تجاهل */ }
  return []
}

/** يحوّل اتجاهاً مختاراً إلى نص الموجّه (chosenConcept) المُمرَّر لخطوة الصورة. */
export function conceptToString(c: Concept | undefined): string {
  if (!c) return ''
  return [c.title, c.mood].filter(Boolean).join(' — ') + (c.brief ? `\n${c.brief}` : '')
}

/** الخطوة 4 — توليد التصميم عبر Gemini + تركيب اللوقو + الرفع إلى التخزين. */
export async function generateDesign(
  openai: OpenAI,
  args: { analysis: unknown; chosenConcept: string; sourceImages: string[]; note?: string; extra?: string },
): Promise<{ imageUrl: string; prompt: string }> {
  const { analysis, chosenConcept, sourceImages, note, extra } = args
  const primarySource = sourceImages[0] ?? null

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
          (sourceImages.length > 1
            ? `الصور الحقيقية المرفقة (${sourceImages.length}) على الروابط التالية — ادمجها جميعاً بتكوين متناسق داخل التصميم الواحد مع الحفاظ على واقعيتها:\n${sourceImages.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n`
            : `الصورة الحقيقية المرفقة هي على الرابط: ${primarySource}\n`) +
          `اترك مساحة فارغة أسفل يمين الفوتر للوقو (سيُضاف لاحقاً برمجياً) ولا ترسم أي شعار هناك.\n` +
          (note && note.trim()
            ? `\n‼️ ملاحظات الأدمن على التصميم (طبّقها بدقّة مع الحفاظ على ثوابت الهوية والصورة الحقيقية): ${note.trim()}\n`
            : '') +
          (extra && extra.trim() ? `\n${extra.trim()}\n` : ''),
      },
    ],
  })
  const designPrompt = promptCompletion.choices[0]?.message?.content ?? ''

  const { b64 } = await generateImageWithGemini(designPrompt, sourceImages)
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

  return { imageUrl: pub.publicUrl, prompt: designPrompt }
}

/**
 * يعيد استضافة صورة مصدر خارجية على تخزين Supabase ويُعيد رابطاً عاماً.
 *
 * ضروري للأخبار من first1saudi.net: تمرير روابطها مباشرةً إلى OpenAI/Gemini يفشل
 * لأن تلك الخدمات تحمّل الصورة من المصدر، وموقع الأخبار بطيء/يحجب التحميل الخارجي
 * ("400 Timeout while downloading ..."). برفعها إلى Supabase (CDN) تصبح سريعة وموثوقة.
 */
export async function rehostImage(url: string): Promise<string> {
  const service = await createServiceRoleClient()
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`تعذّر تحميل صورة المصدر (${resp.status})`)
  const mime = resp.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await resp.arrayBuffer())
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = `studio-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await service.storage.from('content-images').upload(path, buf, { contentType: mime })
  if (error) throw new Error(`فشل رفع صورة المصدر: ${error.message}`)
  return service.storage.from('content-images').getPublicUrl(path).data.publicUrl
}

export interface StudioResult {
  analysis: unknown
  tweets: string
  concepts: Concept[]
  chosenConcept: string
  imageUrl: string
  prompt: string
}

/**
 * تشغيل كامل للأربع خطوات بلا تدخّل بشري (للمُنسّق اليومي).
 * يختار تلقائياً الاتجاه الأول من المفاهيم المقترحة.
 */
export async function runStudioPipeline(input: {
  title?: string
  content?: string
  sourceImages: string[]
  extraInfo?: string
  note?: string
}): Promise<StudioResult> {
  if (!input.sourceImages?.length) throw new Error('لا توجد صورة مصدر للخبر')
  const openai = getOpenAI()
  const newsText = buildNewsText(input)

  // أعِد استضافة الصور الخارجية على Supabase أولاً (تجنّب فشل تحميل OpenAI/Gemini).
  const sourceImages = await Promise.all(input.sourceImages.map(rehostImage))

  const analysis = await analyzeNews(openai, { newsText, sourceImages })
  const tweets = await generateTweets(openai, { analysis, newsText, extra: EVERGREEN_NOTE })
  const concepts = await generateConcepts(openai, { analysis, newsText, sourceImages })
  const chosenConcept = conceptToString(concepts[0])
  const { imageUrl, prompt } = await generateDesign(openai, {
    analysis,
    chosenConcept,
    sourceImages,
    note: input.note,
    extra: EVERGREEN_NOTE,
  })

  return { analysis, tweets, concepts, chosenConcept, imageUrl, prompt }
}
