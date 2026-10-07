export interface GeminiReferenceImage { mimeType: string; data: string }
export interface GeminiImageOptions { aspectRatio?: string; size?: string; timeoutMs?: number; retries?: number }
interface GeminiImageResponse {
  promptFeedback?: { blockReason?: string }
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ thought?: boolean; inlineData?: { mimeType?: string; data?: string } }> } }>
}

export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-nano-banana-2.1'
const ASPECT_RATIOS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9']

export function designImageProvider(env: Record<string, string | undefined> = process.env): 'gemini' | 'openai' {
  const provider = env.DESIGN_IMAGE_PROVIDER?.trim().toLowerCase() || 'openai'
  if (provider !== 'gemini' && provider !== 'openai') throw new Error('DESIGN_IMAGE_PROVIDER يجب أن يكون gemini أو openai')
  return provider
}

export function geminiImageAspectRatio(opts: GeminiImageOptions): string {
  if (opts.aspectRatio) {
    if (!ASPECT_RATIOS.includes(opts.aspectRatio)) throw new Error('نسبة أبعاد غير مدعومة في Gemini')
    return opts.aspectRatio
  }
  const match = opts.size?.match(/^(\d+)x(\d+)$/)
  if (!match) return '4:5'
  const ratio = Number(match[1]) / Number(match[2])
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('أبعاد الصورة غير صالحة')
  return ASPECT_RATIOS.reduce((nearest, value) => {
    const distance = (r: string) => { const [w, h] = r.split(':').map(Number); return Math.abs(Math.log(ratio / (w / h))) }
    return distance(value) < distance(nearest) ? value : nearest
  })
}

export function buildGeminiImagePayload(prompt: string, refs: GeminiReferenceImage[], opts: GeminiImageOptions, resolution = '2K') {
  if (refs.length > 14) throw new Error('Gemini يدعم حتى 14 صورة مرجعية؛ قلّل الصور المحددة')
  if (!['1K', '2K', '4K'].includes(resolution)) throw new Error('GEMINI_IMAGE_SIZE يجب أن يكون 1K أو 2K أو 4K')
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...refs.map(ref => ({ inlineData: { mimeType: ref.mimeType, data: ref.data } }))] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: geminiImageAspectRatio(opts), imageSize: resolution } },
  }
}

export function extractGeminiImage(response: GeminiImageResponse): { b64: string; mimeType: string } {
  if (response.promptFeedback?.blockReason) throw new Error('رفض Gemini طلب الصورة وفق قيود النموذج؛ راجع النص والصور المرجعية')
  for (const candidate of response.candidates ?? []) {
    if (candidate.finishReason && candidate.finishReason !== 'STOP') continue
    for (const part of candidate.content?.parts ?? []) {
      const image = part.inlineData
      // Thought images are intermediate drafts, not the requested final artwork.
      if (part.thought || !image?.data || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType || '')) continue
      return { b64: image.data, mimeType: image.mimeType! }
    }
  }
  throw new Error('لم يُرجع Gemini صورة نهائية؛ قد يكون الطلب محجوباً أو أعاد نصاً فقط')
}

export async function generateImageWithGemini(
  prompt: string,
  refs: GeminiReferenceImage[],
  opts: GeminiImageOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<{ b64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('مفتاح Gemini غير مهيّأ — أضِف GEMINI_API_KEY في إعدادات الخادم')
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('اسم نموذج Gemini غير صالح')
  const body = JSON.stringify(buildGeminiImagePayload(prompt, refs, opts, process.env.GEMINI_IMAGE_SIZE?.trim() || '2K'))
  if (Buffer.byteLength(body) > 20_000_000) throw new Error('صور المصدر كبيرة لطلب Gemini؛ قلّل عدد الصور أو حجمها')
  const retries = opts.retries ?? 2
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body, signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      })
      if (!response.ok) {
        // Keep the useful API validation reason, excluding keys and embedded image data.
        const details = await response.json().catch(() => ({})) as { error?: { message?: unknown } }
        const reason = typeof details.error?.message === 'string'
          ? details.error.message.replaceAll(apiKey, '[redacted]').replace(/AIza[\w-]+/g, '[redacted]').replace(/[A-Za-z0-9+/_=-]{80,}/g, '[image data]').slice(0, 480)
          : ''
        const error = new Error(response.status === 401 || response.status === 403
          ? 'تعذّر الوصول إلى Gemini؛ تحقق من صلاحية المفتاح والوصول إلى النموذج'
          : response.status === 404 ? `نموذج Gemini غير متاح لهذا المفتاح: ${model}`
          : `تعذّر توليد الصورة بواسطة Gemini (HTTP ${response.status})${reason ? `: ${reason}` : ''}`) as Error & { status?: number }
        error.status = response.status
        throw error
      }
      return extractGeminiImage(await response.json() as GeminiImageResponse)
    } catch (error) {
      const status = (error as { status?: number })?.status
      const transient = status === 408 || status === 429 || (status !== undefined && status >= 500) ||
        (error instanceof Error && /fetch failed|network|timeout|aborted|ECONNRESET|ETIMEDOUT/i.test(error.message))
      if (!transient || attempt >= retries) throw error
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)))
    }
  }
}
