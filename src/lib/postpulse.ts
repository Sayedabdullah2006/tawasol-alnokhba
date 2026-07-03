/**
 * تكامل Post-Pulse — النشر إلى قنوات التواصل.
 * يخزّن توكنات OAuth في postpulse_tokens (service role فقط) ويُجدّدها تلقائياً.
 *
 * ملاحظة: لا شيء هنا ينشر منشوراً. النشر يحدث فقط عبر createPost (/v1/posts)
 * الذي يُستدعى يدوياً لاحقاً عند تفعيل زر النشر.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'
import sharp from 'sharp'

const AUTH_BASE = 'https://auth.post-pulse.com'
const API_BASE = 'https://api.post-pulse.com'
const AUDIENCE = 'https://api.post-pulse.com'
export const POSTPULSE_SCOPES =
  'postpulse-api/accounts.read postpulse-api/api postpulse-api/media.write postpulse-api/posts.read postpulse-api/posts.write postpulse-api/webhooks.write offline_access'

// client_id عام (غير سرّي) — يُفضّل ضبطه عبر البيئة؛ القيمة الافتراضية هي المُعطاة.
export const PP_CLIENT_ID = process.env.POSTPULSE_CLIENT_ID || 'Hy7O3XYqaScIwZ7txytwUJIP0OhBeBTN'
export const PP_REDIRECT_URI = process.env.POSTPULSE_REDIRECT_URI || 'https://nukhba.media/oauth/callback'
const PP_CLIENT_SECRET = process.env.POSTPULSE_CLIENT_SECRET || ''

export function postpulseConfigured(): boolean {
  return !!PP_CLIENT_ID && !!PP_CLIENT_SECRET && !!PP_REDIRECT_URI
}

export function buildAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: PP_CLIENT_ID,
    response_type: 'code',
    redirect_uri: PP_REDIRECT_URI,
    scope: POSTPULSE_SCOPES,
    audience: AUDIENCE,
    prompt: 'consent', // يفرض موافقة جديدة لإعادة إصدار refresh_token
    state,
  })
  return `${AUTH_BASE}/authorize?${p.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
}

async function persistTokens(t: TokenResponse) {
  const sc = await createServiceRoleClient()
  const expiresAt = t.expires_in
    ? new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString()
    : null
  const patch: Record<string, unknown> = {
    id: 1,
    access_token: t.access_token,
    token_type: t.token_type ?? 'Bearer',
    scope: t.scope ?? null,
    expires_at: expiresAt,
    raw: t as unknown,
    updated_at: new Date().toISOString(),
  }
  // نحافظ على refresh_token القديم إن لم يُرجِعه التجديد
  if (t.refresh_token) patch.refresh_token = t.refresh_token
  await sc.from('postpulse_tokens').upsert(patch, { onConflict: 'id' })
}

/** يبدّل authorization code بتوكن ويُخزّنه. */
export async function exchangeCodeForToken(code: string): Promise<void> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: PP_CLIENT_ID,
      client_secret: PP_CLIENT_SECRET,
      code,
      redirect_uri: PP_REDIRECT_URI,
    }),
  })
  if (!res.ok) throw new Error(`فشل تبادل الرمز: ${res.status} ${await res.text()}`)
  await persistTokens(await res.json())
}

/** يعيد توكناً صالحاً (يجدّده عبر refresh_token إن انتهى). يرمي إن لم يُربط بعد. */
export async function getValidAccessToken(): Promise<string> {
  const sc = await createServiceRoleClient()
  const { data } = await sc.from('postpulse_tokens').select('*').eq('id', 1).single()
  if (!data?.access_token) throw new Error('Post-Pulse غير مربوط بعد')

  const notExpired = data.expires_at && new Date(data.expires_at).getTime() > Date.now()
  if (notExpired) return data.access_token as string

  // تجديد
  if (!data.refresh_token) throw new Error('انتهت صلاحية التوكن ولا يوجد refresh_token — أعد الربط')
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: PP_CLIENT_ID,
      client_secret: PP_CLIENT_SECRET,
      refresh_token: data.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`فشل تجديد التوكن: ${res.status} — أعد الربط`)
  const t: TokenResponse = await res.json()
  await persistTokens(t)
  return t.access_token
}

export async function isConnected(): Promise<boolean> {
  try { await getValidAccessToken(); return true } catch { return false }
}

/** اختبار قراءة: قائمة الحسابات المربوطة (لا ينشر شيئاً). */
export async function listAccounts(): Promise<unknown> {
  const token = await getValidAccessToken()
  const res = await fetch(`${API_BASE}/v1/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`تعذّر جلب الحسابات: ${res.status} ${await res.text()}`)
  return res.json()
}

// يستخرج مسار الوسائط من ناتج confirm (يُستخدم في attachmentPaths عند النشر).
function extractMediaPath(confirm: unknown, fallbackKey: string): string {
  if (confirm && typeof confirm === 'object') {
    const o = confirm as Record<string, unknown>
    for (const k of ['path', 'mediaPath', 'media_path', 'media', 'key', 'attachmentPath']) {
      if (typeof o[k] === 'string' && o[k]) return o[k] as string
    }
  }
  return fallbackKey
}

/**
 * يرفع صورة إلى Post-Pulse عبر الرابط (presign → PUT → confirm). لا ينشر شيئاً.
 * يعيد { path, raw }: path هو مسار الوسائط المستخدم في attachmentPaths.
 */
export async function uploadMediaFromUrl(imageUrl: string): Promise<{ path: string; raw: unknown }> {
  const token = await getValidAccessToken()

  // 1) جلب بايتات الصورة من تخزيننا
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`تعذّر جلب الصورة: ${imgRes.status}`)
  const contentType = imgRes.headers.get('content-type') || 'image/png'
  let bytes = Buffer.from(await imgRes.arrayBuffer())
  // بعض المنصّات (تيك توك) ترفض أي صورة يتجاوز أحد أبعادها 1080px.
  // نصغّر أطول ضلع إلى 1080 مع الحفاظ على النسبة (بلا تكبير) لتقبلها كل القنوات.
  try {
    const meta = await sharp(bytes).metadata()
    if (Math.max(meta.width ?? 0, meta.height ?? 0) > 1080) {
      bytes = await sharp(bytes)
        .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
        .toBuffer()
    }
  } catch { /* إن تعذّر التصغير نُبقي الصورة الأصلية */ }
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
  const filename = `nukhba-${Date.now()}.${ext}`

  // 2) طلب رابط رفع موقّع
  const urlRes = await fetch(`${API_BASE}/v1/media/upload/urls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, sizeBytes: bytes.length }),
  })
  if (!urlRes.ok) throw new Error(`فشل طلب رابط الرفع: ${urlRes.status} ${await urlRes.text()}`)
  const presign = await urlRes.json() as { key: string; url: string; headers?: Record<string, string> }

  // 3) رفع البايتات (PUT) إلى الرابط الموقّع.
  // SigV4: نرسل فقط الترويسات الموقّع عليها. نقرأ X-Amz-SignedHeaders من الرابط:
  // - إن أعاد الـ API ترويسات صريحة نستخدمها كما هي.
  // - وإلا: نرسل Content-Type فقط إن كان ضمن الترويسات الموقّعة، وإلا لا نرسل شيئاً.
  const signedHeaders = (new URL(presign.url).searchParams.get('X-Amz-SignedHeaders') || '').toLowerCase()
  let putHeaders: Record<string, string>
  if (presign.headers && Object.keys(presign.headers).length) {
    // توحيد أسماء الترويسات لحروف صغيرة وإزالة التكرار (الـ API يعيد content-type و Content-Type
    // معاً، فيدمجهما fetch ويُفسد القيمة ⇒ SignatureDoesNotMatch).
    putHeaders = {}
    for (const [k, v] of Object.entries(presign.headers)) {
      putHeaders[k.toLowerCase()] = String(v)
    }
  } else if (signedHeaders.includes('content-type')) {
    putHeaders = { 'content-type': contentType }
  } else {
    putHeaders = {}
  }
  const putRes = await fetch(presign.url, {
    method: 'PUT',
    headers: putHeaders,
    body: bytes,
  })
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => '')
    throw new Error(
      `فشل رفع الملف: ${putRes.status} | SignedHeaders=[${signedHeaders || 'none'}] | أرسلنا=[${Object.keys(putHeaders).join(',') || 'none'}] | ${errBody}`,
    )
  }

  // 4) تأكيد الرفع
  const confirmRes = await fetch(`${API_BASE}/v1/media/upload/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: presign.key }),
  })
  const confirmText = await confirmRes.text().catch(() => '')
  if (!confirmRes.ok) throw new Error(`فشل تأكيد الرفع: ${confirmRes.status} ${confirmText}`)
  // قد يعيد التأكيد جسماً فارغاً عند النجاح — نتعامل معه بأمان بدل تعطّل JSON.
  let confirmData: unknown = null
  if (confirmText) {
    try { confirmData = JSON.parse(confirmText) } catch { confirmData = { raw: confirmText } }
  }
  return { path: extractMediaPath(confirmData, presign.key), raw: confirmData ?? { key: presign.key } }
}

// إعدادات المنصّة المطلوبة لكل قناة (لكل منصّة حقول إلزامية مختلفة).
// title يُمرَّر لمنصّات تتطلّبه (TikTok/YouTube) حيث يكون content وصفاً.
function platformSettingsFor(platform: string, title: string): Record<string, unknown> {
  switch ((platform || '').toUpperCase()) {
    case 'INSTAGRAM':
      return { type: 'INSTAGRAM', publicationType: 'FEED' }
    case 'TIKTOK':
      return {
        type: 'TIKTOK',
        title,
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        disableComments: false,
        disableDuet: false,
        disableStitch: false,
      }
    case 'X_TWITTER':
      return { type: 'X_TWITTER' }
    case 'LINKEDIN':
      return { type: 'LINKEDIN' }
    case 'FACEBOOK':
      return { type: 'FACEBOOK' }
    case 'YOUTUBE':
      return { type: 'YOUTUBE', title }
    default:
      return { type: platform }
  }
}

// عنوان مختصر من نص المنشور (أول سطر فعلي بلا هاشتاقات) — لمنصّات تتطلّب title.
function deriveTitle(content: string): string {
  const line = content
    .split('\n')
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#')) || content.trim()
  const t = line.replace(/\s+/g, ' ').trim()
  return (t.length > 90 ? t.slice(0, 90).trim() : t) || 'منشور'
}

/**
 * نشر فوري للنص + التصميم إلى الحسابات المربوطة عبر /v1/posts/schedule
 * (scheduledTime=الآن، isDraft=false). إن لم تُحدَّد accountIds يُنشر لكل الحسابات.
 * يبني platformSettings المناسبة لكل منصّة. يعيد { result, accountIds, scheduleId }.
 */
export async function publishNow(args: {
  content: string
  attachmentPaths?: string[]
  accountIds?: number[]
  platforms?: string[] // قصر النشر على منصّات بعينها (مثل ['X_TWITTER'])
  scheduledTime?: string // ISO UTC — افتراضياً الآن (نشر فوري)
}): Promise<{ result: unknown; accountIds: number[]; scheduleId: string | null }> {
  const token = await getValidAccessToken()

  // نحتاج كائنات الحسابات كاملة (id + platform) لبناء إعدادات كل منصّة
  const accountsRaw = await listAccounts()
  const all = Array.isArray(accountsRaw) ? (accountsRaw as Array<Record<string, unknown>>) : []
  let targets = all.filter((a) => a && Number.isFinite(Number(a.id)))
  if (args.accountIds && args.accountIds.length) {
    const set = new Set(args.accountIds.map(Number))
    targets = targets.filter((a) => set.has(Number(a.id)))
  }
  if (args.platforms && args.platforms.length) {
    const set = new Set(args.platforms.map(p => p.toUpperCase()))
    targets = targets.filter((a) => set.has(String(a.platform ?? '').toUpperCase()))
  }
  if (!targets.length) throw new Error('لا توجد حسابات مطابقة في Post-Pulse')

  const post: Record<string, unknown> = { content: args.content }
  if (args.attachmentPaths && args.attachmentPaths.length) post.attachmentPaths = args.attachmentPaths
  const title = deriveTitle(args.content)

  const res = await fetch(`${API_BASE}/v1/posts/schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scheduledTime: args.scheduledTime || new Date().toISOString(), // الموعد أو الآن
      isDraft: false,
      publications: targets.map((a) => ({
        socialMediaAccountId: Number(a.id),
        platformSettings: platformSettingsFor(String(a.platform ?? ''), title),
        posts: [post],
      })),
    }),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`فشل النشر: ${res.status} ${text}`)
  let result: unknown = null
  try { result = text ? JSON.parse(text) : { ok: true } } catch { result = { raw: text } }

  const accountIds = targets.map((a) => Number(a.id))
  // محاولة استخراج معرّف الجدولة لمطابقة الـ webhook لاحقاً
  let scheduleId: string | null = null
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>
    const cand = o.scheduleId ?? o.id
    if (cand != null) scheduleId = String(cand)
  }
  return { result, accountIds, scheduleId }
}

/**
 * يجدول/يحفظ منشوراً عبر /v1/posts/schedule. لإكمال الـ onboarding بأمان نستخدم
 * isDraft=true افتراضياً (يُحفظ كمسودة ولا يُنشر إطلاقاً). البنية الصحيحة:
 * publications[].socialMediaAccountId + posts[].content + platformSettings.
 */
export async function schedulePost(args: {
  socialMediaAccountId: number
  content: string
  attachmentPaths?: string[]
  scheduledTime: string
  isDraft?: boolean
  platformSettings?: Record<string, unknown>
}): Promise<unknown> {
  const token = await getValidAccessToken()
  const post: Record<string, unknown> = { content: args.content }
  if (args.attachmentPaths && args.attachmentPaths.length) post.attachmentPaths = args.attachmentPaths
  const res = await fetch(`${API_BASE}/v1/posts/schedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scheduledTime: args.scheduledTime,
      isDraft: args.isDraft ?? true,
      publications: [{
        socialMediaAccountId: args.socialMediaAccountId,
        platformSettings: args.platformSettings ?? {},
        posts: [post],
      }],
    }),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`فشل جدولة المنشور: ${res.status} ${text}`)
  try { return text ? JSON.parse(text) : { ok: true } } catch { return { raw: text } }
}

/** يجلب تفاصيل جدولة لمعرفة حالة كل منصّة (يجرّب المسارات المحتملة). */
export async function getScheduleStatus(id: string): Promise<{ path: string; data: unknown }> {
  const token = await getValidAccessToken()
  const paths = [`/v1/posts/${id}`, `/v1/schedules/${id}`, `/v1/posts/schedule/${id}`]
  let lastStatus = 0
  for (const p of paths) {
    const r = await fetch(`${API_BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) return { path: p, data: await r.json().catch(() => null) }
    lastStatus = r.status
  }
  throw new Error(`تعذّر جلب حالة الجدولة (آخر رمز: ${lastStatus})`)
}

export interface PPScheduledItem {
  id: string
  when: string          // ISO scheduledTime
  status: string        // overallStatus
  content: string
  channels: number
}

/** يقرأ المنشورات المجدولة من Post-Pulse (مصدر الحقيقة) — يجرّب المسارات المحتملة. */
export async function listScheduledPosts(): Promise<PPScheduledItem[]> {
  const token = await getValidAccessToken()
  const paths = ['/v1/posts', '/v1/posts/schedule', '/v1/schedules']
  for (const p of paths) {
    let r: Response
    try { r = await fetch(`${API_BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } }) } catch { continue }
    if (!r.ok) continue
    const data = await r.json().catch(() => null)
    const arr: unknown[] | null = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.items) ? (data as { items: unknown[] }).items
      : Array.isArray((data as Record<string, unknown>)?.content) ? (data as { content: unknown[] }).content
      : Array.isArray((data as Record<string, unknown>)?.data) ? (data as { data: unknown[] }).data
      : null
    if (!arr) continue
    const out: PPScheduledItem[] = []
    for (const s of arr) {
      if (!s || typeof s !== 'object') continue
      const o = s as Record<string, unknown>
      const when = (o.scheduledTime ?? o.scheduled_at ?? o.scheduledAt) as string | undefined
      if (!when) continue
      const pubs = Array.isArray(o.publications) ? (o.publications as Record<string, unknown>[]) : []
      const post0 = pubs[0] && Array.isArray((pubs[0] as Record<string, unknown>).posts)
        ? ((pubs[0] as { posts: Record<string, unknown>[] }).posts[0] as Record<string, unknown> | undefined)
        : undefined
      out.push({
        id: String(o.id ?? o.scheduleId ?? when),
        when,
        status: String(o.overallStatus ?? o.status ?? 'scheduled').toLowerCase(),
        content: String(post0?.content ?? ''),
        channels: pubs.length,
      })
    }
    return out
  }
  return []
}
