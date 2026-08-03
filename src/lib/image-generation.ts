import https from 'https'

export interface RefImage {
  mimeType: string
  data: string // base64 without data: prefix
}

interface OpenAIImageOptions {
  aspectRatio?: string
  size?: string
  quality?: 'low' | 'medium' | 'high' | 'auto'
  timeoutMs?: number
  retries?: number
  allowSafetyFallback?: boolean
  safetyFallbackPrompt?: string
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>
  error?: { message?: string }
}

// Direct GPT Image API. This avoids the extra mainline-model hop in Responses.
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
const OPENAI_IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY || 'medium') as OpenAIImageOptions['quality']
const OA_AGENT = new https.Agent({ keepAlive: false })

function imageSizeFor(opts: OpenAIImageOptions): string {
  if (opts.size) return opts.size
  switch (opts.aspectRatio) {
    case '16:9':
      return '1536x1024'
    case '9:16':
      return '1088x1920'
    case '1:1':
      return '1024x1024'
    case '4:5':
    default:
      return '1024x1536'
  }
}

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number })?.status ?? 0
  return (
    /premature close|terminated|ECONNRESET|socket hang up|network|fetch failed|invalid response body|other side closed|timeout|aborted|EPIPE|ETIMEDOUT|ECONNREFUSED/i.test(msg) ||
    status === 408 || status === 409 || status === 429 || status >= 500
  )
}

async function fetchImageAsBase64(url: string): Promise<RefImage> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`تعذّر تحميل الصورة المرجعية: ${url}`)
  const mimeType = resp.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await resp.arrayBuffer())
  return { mimeType, data: buf.toString('base64') }
}

function postJsonOnce(
  apiKey: string,
  path: string,
  bodyPayload: unknown,
  timeoutMs: number,
): Promise<OpenAIImageResponse> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(bodyPayload), 'utf8')
    const baseURL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const url = new URL(`${baseURL}${path}`)
    const org = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION
    const project = process.env.OPENAI_PROJECT_ID
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
      Authorization: `Bearer ${apiKey}`,
    }
    if (org) headers['OpenAI-Organization'] = org
    if (project) headers['OpenAI-Project'] = project

    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        agent: OA_AGENT,
        headers,
        timeout: timeoutMs,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c as Buffer))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            const e = new Error(`OpenAI Images ${status}: ${text.slice(0, 500)}`) as Error & { status?: number }
            e.status = status
            return reject(e)
          }
          try {
            resolve(JSON.parse(text) as OpenAIImageResponse)
          } catch {
            reject(new Error('invalid response body from OpenAI Images (JSON parse failed)'))
          }
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('OpenAI Images request timeout')))
    req.write(body)
    req.end()
  })
}

function isModerationBlocked(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /moderation_blocked|rejected by the safety system|image_generation_user_error/i.test(message)
}

const SAFE_EDITORIAL_FALLBACK_PROMPT = [
  'Create a polished vertical 4:5 editorial social-media graphic about learning, scientific curiosity, global collaboration, and achievement.',
  'Use only abstract geometric science motifs, elegant light trails, a deep teal and turquoise palette with restrained gold accents, and a rich full-bleed composition.',
  'Use a concise Arabic headline and no more than two short factual callouts. Add a compact footer with the recognizable icons for X, Instagram, LinkedIn, Facebook, and TikTok, followed by the exact handle @First1Saudi.',
  'Do not include logos, brand names, flags, weapons, dangerous materials, medical imagery, politics, military content, or violence.',
].join(' ')

const SAFE_EDITORIAL_REFERENCE_FALLBACK_PROMPT = [
  'Create a polished vertical 4:5 editorial social-media graphic about learning, scientific curiosity, global collaboration, and achievement.',
  'Use the supplied reference image as an authentic editorial photo integrated naturally into the composition. Preserve every depicted person faithfully: do not alter their face, identity, body, clothing, or apparent age.',
  'Use an abstract deep teal and turquoise scientific setting with restrained gold accents, a concise Arabic headline, and no more than two short factual callouts. Add a compact footer with the recognizable icons for X, Instagram, LinkedIn, Facebook, and TikTok, followed by the exact handle @First1Saudi.',
  'Do not add logos, brand names, flags, weapons, dangerous materials, medical imagery, politics, military content, or violence.',
].join(' ')

export function imageGenerationErrorMessage(error: unknown): string {
  if (isModerationBlocked(error)) {
    return 'تعذّر توليد التصميم بعد محاولة آمنة تحفظ الصور المرجعية. أعد المحاولة بتوجيه بصري أبسط أو بصورة مرجعية مختلفة.'
  }
  return error instanceof Error ? error.message : 'تعذّر إكمال توليد التصميم'
}

function buildMultipartBody(fields: Record<string, string>, files: RefImage[]): { body: Buffer; contentType: string } {
  const boundary = `----openai-image-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const chunks: Buffer[] = []

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`))
    chunks.push(Buffer.from(`${value}\r\n`))
  }

  files.forEach((file, index) => {
    const ext = file.mimeType.includes('jpeg') || file.mimeType.includes('jpg') ? 'jpg' : file.mimeType.includes('webp') ? 'webp' : 'png'
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="image[]"; filename="reference-${index + 1}.${ext}"\r\n`))
    chunks.push(Buffer.from(`Content-Type: ${file.mimeType}\r\n\r\n`))
    chunks.push(Buffer.from(file.data, 'base64'))
    chunks.push(Buffer.from('\r\n'))
  })

  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

function postMultipartOnce(
  apiKey: string,
  path: string,
  fields: Record<string, string>,
  files: RefImage[],
  timeoutMs: number,
): Promise<OpenAIImageResponse> {
  return new Promise((resolve, reject) => {
    const { body, contentType } = buildMultipartBody(fields, files)
    const baseURL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const url = new URL(`${baseURL}${path}`)
    const org = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION
    const project = process.env.OPENAI_PROJECT_ID
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      Authorization: `Bearer ${apiKey}`,
    }
    if (org) headers['OpenAI-Organization'] = org
    if (project) headers['OpenAI-Project'] = project

    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        agent: OA_AGENT,
        headers,
        timeout: timeoutMs,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c as Buffer))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            const e = new Error(`OpenAI Images ${status}: ${text.slice(0, 500)}`) as Error & { status?: number }
            e.status = status
            return reject(e)
          }
          try {
            resolve(JSON.parse(text) as OpenAIImageResponse)
          } catch {
            reject(new Error('invalid response body from OpenAI Images (JSON parse failed)'))
          }
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('OpenAI Images request timeout')))
    req.write(body)
    req.end()
  })
}

async function createImageViaImageApi(
  promptText: string,
  refs: RefImage[],
  opts: OpenAIImageOptions,
): Promise<{ b64: string; mimeType: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('مفتاح OpenAI غير مهيّأ — أضِف OPENAI_API_KEY في إعدادات الخادم')
  }

  const commonFields: Record<string, string> = {
    model: OPENAI_IMAGE_MODEL,
    prompt: promptText,
    size: imageSizeFor(opts),
    quality: opts.quality ?? OPENAI_IMAGE_QUALITY ?? 'medium',
  }

  const retries = opts.retries ?? 3
  const timeoutMs = opts.timeoutMs ?? 180_000
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const json = refs.length
        ? await postMultipartOnce(apiKey, '/images/edits', commonFields, refs, timeoutMs)
        : await postJsonOnce(apiKey, '/images/generations', commonFields, timeoutMs)
      const imageBase64 = json.data?.find(item => typeof item.b64_json === 'string' && item.b64_json.length > 0)?.b64_json
      if (imageBase64) return { b64: imageBase64, mimeType: 'image/png' }

      const message = json.error?.message || 'لم يُرجِع OpenAI صورة'
      throw new Error(message)
    } catch (err) {
      lastErr = err
      if (attempt === retries || !isTransient(err)) break
      const waitMs = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  // A safety rejection can be triggered by a complex prompt or a reference image.
  // Retry once with a benign, text-free editorial composition instead of leaving the user with a raw provider error.
  if (isModerationBlocked(lastErr) && opts.allowSafetyFallback !== false) {
    console.warn('[OpenAI Images] moderation blocked the requested output; using a safe editorial fallback.')
    try {
      return await createImageViaImageApi(
        opts.safetyFallbackPrompt?.trim() || (refs.length ? SAFE_EDITORIAL_REFERENCE_FALLBACK_PROMPT : SAFE_EDITORIAL_FALLBACK_PROMPT),
        refs,
        { ...opts, retries: 0, allowSafetyFallback: false, safetyFallbackPrompt: undefined },
      )
    } catch (fallbackError) {
      if (isModerationBlocked(fallbackError)) throw new Error(imageGenerationErrorMessage(fallbackError))
      throw fallbackError
    }
  }
  if (isModerationBlocked(lastErr)) throw new Error(imageGenerationErrorMessage(lastErr))
  throw lastErr
}

export async function generateImageWithOpenAI(
  promptText: string,
  referenceImageUrls: string[],
  opts: OpenAIImageOptions = {},
): Promise<{ b64: string; mimeType: string }> {
  const refs: RefImage[] = []
  for (const url of referenceImageUrls) {
    if (!url) continue
    refs.push(await fetchImageAsBase64(url))
  }
  return generateImageFromPartsWithOpenAI(promptText, refs, opts)
}

export async function generateImageFromPartsWithOpenAI(
  promptText: string,
  refs: RefImage[],
  opts: OpenAIImageOptions = {},
): Promise<{ b64: string; mimeType: string }> {
  return createImageViaImageApi(promptText, refs, opts)
}
