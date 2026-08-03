/**
 * التوليد التلقائي لاستوديو الطلب عند اعتماد الدفع (الحالة → قيد التنفيذ).
 *
 * يُستدعى «fire-and-forget» من مساري تأكيد الدفع (ميسر/تمارا). لأن التطبيق خادم
 * Node دائم على Railway، تكمل المهمة في الخلفية دون تعطيل رد الدفع.
 *
 * الخطوات: اختيار أفضل الصور (البورتريه الشخصي أولاً بالرؤية) ← تحليل ← تغريدات ←
 * اتجاهات ← تصميم كل اتجاه (٣). تُحفظ في أعمدة الطلب فتظهر جاهزة في استوديو الأدمن.
 * علامة ai_auto_generated_at تمنع التكرار. للطلبات المفردة فقط في هذه المرحلة.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getOpenAI, chatComplete } from '@/lib/openai'
import {
  analyzeNews, generateTweets, generateConcepts, generateDesign,
  conceptToString, buildNewsText, rehostImage, shuffledPosterStyles, type Concept,
} from '@/lib/ai-studio'
import { sendEmail } from '@/lib/email'

const ADMIN_EMAIL = 'first1saudi@gmail.com'
const SITE_URL = process.env.APP_BASE_URL || 'https://nukhba.media'
const MAX_VISION_IMAGES = 8   // سقف الصور المُرسلة لنموذج الرؤية (ضبط التكلفة)
const MAX_SOURCE_IMAGES = 3   // البورتريه + حتى صورتين داعمتين

/**
 * يختار أفضل صور المصدر ويرتّبها: البورتريه الشخصي الواضح أولاً، ثم الداعمة،
 * مع استبعاد الشعارات/الصور النصية/الرديئة. يعتمد على نموذج رؤية؛ وإلا يُبقي الترتيب.
 */
async function selectBestImages(openai: ReturnType<typeof getOpenAI>, images: string[]): Promise<string[]> {
  if (images.length <= 1) return images
  const pool = images.slice(0, MAX_VISION_IMAGES)
  try {
    const content: Array<Record<string, unknown>> = [{
      type: 'text',
      text: 'رتّب هذه الصور لاختيار صور مصدر لتصميم منشور يُبرز شخصاً. أعِد JSON فقط بهذا الشكل: ' +
        '{"primaryIndex": <رقم الصورة الأنسب كبورتريه شخصي واضح: وجه واحد أمامي عالي الجودة>, ' +
        '"ordered": [<أرقام كل الصور من الأنسب للأقل>], "exclude": [<أرقام صور شعارات/نص/رديئة تُستبعد>]}. ' +
        'الأولوية للوجه الواضح وجودة الصورة وملاءمتها لإبراز الشخص.',
    }]
    pool.forEach((url, i) => {
      content.push({ type: 'text', text: `صورة رقم ${i}:` })
      content.push({ type: 'image_url', image_url: { url } })
    })
    const completion = await chatComplete(openai, {
      model: 'gpt-5.5',
      response_format: { type: 'json_object' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: 'user', content: content as any }],
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { primaryIndex?: number; ordered?: number[]; exclude?: number[] }
    const exclude = new Set((parsed.exclude ?? []).map(Number))
    const order: number[] = []
    const push = (i: number) => { if (Number.isInteger(i) && i >= 0 && i < pool.length && !exclude.has(i) && !order.includes(i)) order.push(i) }
    push(Number(parsed.primaryIndex))
    for (const i of parsed.ordered ?? []) push(Number(i))
    for (let i = 0; i < pool.length; i++) push(i) // تعبئة أي متبقٍّ
    const result = order.map(i => pool[i])
    return result.length ? result : pool
  } catch {
    return pool
  }
}

/** يبني إيميل إشعار الأدمن باكتمال التوليد التلقائي. */
function buildEmail(reqNumber: string, clientName: string, requestId: string, designs: { title: string; imageUrl: string }[]): string {
  const thumbs = designs.map(d =>
    `<img src="${d.imageUrl}" alt="${d.title}" style="width:120px;border-radius:8px;border:1px solid #e2e8f0;margin:4px" />`,
  ).join('')
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f1f5f9;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px">
      <h2 style="color:#0A2D35;margin:0 0 8px">⚡ تم التوليد التلقائي للطلب ${reqNumber}</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 12px">العميل: ${clientName} — أُنشئت ${designs.length} تصاميم تلقائياً عند اعتماد الدفع. راجعها واعتمِد الأنسب من الاستوديو.</p>
      <div style="text-align:center">${thumbs}</div>
      <div style="text-align:center;margin-top:16px">
        <a href="${SITE_URL}/admin/requests/${requestId}" style="display:inline-block;background:#2D8B3F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">فتح الطلب في الاستوديو</a>
      </div>
    </div></body></html>`
}

/**
 * ينفّذ التوليد التلقائي الكامل لطلب مفرد. آمن للاستدعاء fire-and-forget.
 */
export async function autoRunRequestStudio(requestId: string): Promise<void> {
  const sc = await createServiceRoleClient()
  const { data: req } = await sc
    .from('publish_requests')
    .select('id, request_number, title, content, content_images, campaign_posts, ai_auto_generated_at, client_name')
    .eq('id', requestId)
    .single()
  if (!req) return
  // للطلبات المفردة فقط في هذه المرحلة (الحملات لاحقاً)
  if (Array.isArray(req.campaign_posts) && req.campaign_posts.length) return
  if (req.ai_auto_generated_at) return // سبق التوليد التلقائي

  const images: string[] = (Array.isArray(req.content_images) ? req.content_images : []).filter((u): u is string => !!u)
  if (!images.length) return // لا صور — يُترك للأدمن يدوياً

  // حجز العلامة مبكراً لمنع تشغيلين متزامنين (ويبهوك + مسار تحقق)
  await sc.from('publish_requests')
    .update({ ai_auto_generated_at: new Date().toISOString() })
    .eq('id', requestId).is('ai_auto_generated_at', null)

  try {
    const openai = getOpenAI()
    // إعادة استضافة الصور على تخزيننا (روابط دائمة تُحمَّل بسرعة في التحليل/التصميم)
    const hosted: string[] = []
    for (const u of images) { try { hosted.push(await rehostImage(u)) } catch { /* تجاهل صورة متعذّرة */ } }
    if (!hosted.length) throw new Error('تعذّر تجهيز أي صورة مصدر')

    const ordered = await selectBestImages(openai, hosted)
    const sourceImages = ordered.slice(0, MAX_SOURCE_IMAGES)
    const newsText = buildNewsText({ title: req.title ?? '', content: req.content ?? '' })

    const analysis = await analyzeNews(openai, { newsText, sourceImages })
    const tweets = await generateTweets(openai, { analysis, newsText })
    const concepts: Concept[] = await generateConcepts(openai, { analysis, newsText, sourceImages })

    const styles = shuffledPosterStyles()
    const designs: { title: string; imageUrl: string; brief: string }[] = []
    let lastPrompt = ''
    for (let i = 0; i < concepts.length; i++) {
      const brief = concepts[i].brief ?? concepts[i].title ?? ''
      try {
        const { imageUrl, prompt } = await generateDesign(openai, {
          analysis, chosenConcept: brief, sourceImages, extra: styles[i % styles.length], preparedPrompt: concepts[i].imagePrompt,
        })
        designs.push({ title: concepts[i].title ?? `اتجاه ${i + 1}`, imageUrl, brief })
        lastPrompt = prompt
      } catch { /* تجاهل فشل تصميم واحد */ }
    }
    if (!designs.length) throw new Error('فشل توليد كل التصاميم')

    // حفظ في أعمدة الطلب بنفس الأشكال التي يقرأها استوديو الأدمن
    await sc.from('publish_requests').update({
      ai_analysis: analysis,
      ai_tweets: { raw: tweets },
      ai_design_concepts: { items: concepts },
      ai_chosen_concept: { text: conceptToString(concepts[0]) },
      ai_source_image: sourceImages[0] ?? null,
      ai_image_prompt: lastPrompt,
      ai_designs: designs,
      ai_generated_at: new Date().toISOString(),
    }).eq('id', requestId)

    const reqNumber = req.request_number ? `#${req.request_number}` : `#${requestId.slice(0, 8)}`
    await sendEmail(ADMIN_EMAIL, `⚡ توليد تلقائي جاهز — الطلب ${reqNumber}`,
      buildEmail(reqNumber, (req.client_name as string) || 'عميل', requestId, designs)).catch(() => {})
  } catch (err) {
    // عند الفشل نُلغي العلامة ليتمكّن الأدمن أو محاولة لاحقة من التوليد
    try { await sc.from('publish_requests').update({ ai_auto_generated_at: null }).eq('id', requestId) } catch { /* تجاهل */ }
    console.error(`[AUTO_STUDIO] فشل التوليد التلقائي للطلب ${requestId}:`, err instanceof Error ? err.message : err)
  }
}
