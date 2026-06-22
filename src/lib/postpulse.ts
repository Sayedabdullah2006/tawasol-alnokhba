/**
 * تكامل Post-Pulse — النشر إلى قنوات التواصل.
 * يخزّن توكنات OAuth في postpulse_tokens (service role فقط) ويُجدّدها تلقائياً.
 *
 * ملاحظة: لا شيء هنا ينشر منشوراً. النشر يحدث فقط عبر createPost (/v1/posts)
 * الذي يُستدعى يدوياً لاحقاً عند تفعيل زر النشر.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'

const AUTH_BASE = 'https://auth.post-pulse.com'
const API_BASE = 'https://api.post-pulse.com'
const AUDIENCE = 'https://api.post-pulse.com'
export const POSTPULSE_SCOPES =
  'postpulse-api/accounts.read postpulse-api/posts.write postpulse-api/media.write'

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

/**
 * يرفع صورة إلى Post-Pulse عبر الرابط (presign → PUT → confirm). لا ينشر شيئاً.
 * يعيد ناتج confirm (يحوي مسار الوسائط المستخدم لاحقاً في attachmentPaths).
 */
export async function uploadMediaFromUrl(imageUrl: string): Promise<unknown> {
  const token = await getValidAccessToken()

  // 1) جلب بايتات الصورة من تخزيننا
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`تعذّر جلب الصورة: ${imgRes.status}`)
  const contentType = imgRes.headers.get('content-type') || 'image/png'
  const bytes = Buffer.from(await imgRes.arrayBuffer())
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
  // نرسل الترويسات التي أعادها الـ API حرفياً (هي الموقّع عليها)؛ وإن لم تُعِد أيّاً
  // نكتفي بـ Content-Type المطابق لما طلبنا به الرابط.
  const putHeaders =
    presign.headers && Object.keys(presign.headers).length
      ? presign.headers
      : { 'Content-Type': contentType }
  const putRes = await fetch(presign.url, {
    method: 'PUT',
    headers: putHeaders,
    body: bytes,
  })
  if (!putRes.ok) throw new Error(`فشل رفع الملف: ${putRes.status} ${await putRes.text().catch(() => '')}`)

  // 4) تأكيد الرفع
  const confirmRes = await fetch(`${API_BASE}/v1/media/upload/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: presign.key }),
  })
  if (!confirmRes.ok) throw new Error(`فشل تأكيد الرفع: ${confirmRes.status} ${await confirmRes.text()}`)
  return confirmRes.json()
}
