/**
 * Gemini image generation helper (REST — لا حاجة لحزمة npm إضافية).
 * يُستخدم في الخطوة الرابعة لتوليد التصميم مع الحفاظ على الصور المرجعية
 * (الصورة الشخصية الحقيقية + شعار أول سعودي).
 *
 * يقرأ المفتاح من process.env.GEMINI_API_KEY فقط — لا يُكتب في الكود.
 */

// نموذج توليد/تحرير الصور من Google — «نانو بانانا برو» (Gemini 3 Pro Image)
// أقوى بكثير في رسم النص العربي مقارنة بـ nano-banana العادي (gemini-2.5-flash-image)
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'

interface RefImage {
  mimeType: string
  data: string // base64 (بدون data: prefix)
}

// يحمّل صورة من رابط ويعيدها base64 + نوعها
async function fetchImageAsBase64(url: string): Promise<RefImage> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`تعذّر تحميل الصورة المرجعية: ${url}`)
  const mimeType = resp.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await resp.arrayBuffer())
  return { mimeType, data: buf.toString('base64') }
}

/**
 * يولّد صورة تصميم عبر Gemini.
 * @param promptText برومبت التصميم التفصيلي (المُولَّد من OpenAI في الخطوة السابقة)
 * @param referenceImageUrls روابط الصور المرجعية (الصورة الشخصية أولاً ثم اللوقو)
 * @returns الصورة الناتجة base64 (PNG/JPEG حسب ما يعيده النموذج) + نوعها
 */
export async function generateImageWithGemini(
  promptText: string,
  referenceImageUrls: string[],
  opts: { aspectRatio?: string } = {},
): Promise<{ b64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('مفتاح Gemini غير مهيّأ — أضِف GEMINI_API_KEY في إعدادات الخادم')
  }

  // أجزاء الرسالة: النص أولاً ثم الصور المرجعية
  const parts: any[] = [{ text: promptText }]
  for (const url of referenceImageUrls) {
    if (!url) continue
    const img = await fetchImageAsBase64(url)
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        // لا نفرض نسبة أبعاد افتراضياً: في وضع التحرير، فرض 4:5 يدفع النموذج
        // لإعادة تكوين المشهد وتوليد شخص جديد. نمرّر aspectRatio فقط عند الطلب.
        ...(opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}),
      },
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`فشل توليد الصورة عبر Gemini: ${resp.status} ${errText}`)
  }

  const json: any = await resp.json()
  // استخراج أول جزء صورة من الاستجابة
  const candidateParts = json?.candidates?.[0]?.content?.parts ?? []
  for (const p of candidateParts) {
    const inline = p.inlineData || p.inline_data
    if (inline?.data) {
      return { b64: inline.data, mimeType: inline.mimeType || inline.mime_type || 'image/png' }
    }
  }
  throw new Error('لم يُرجِع Gemini صورة')
}
