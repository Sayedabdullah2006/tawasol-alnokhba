import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'

const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const X_ME_URL = 'https://api.x.com/2/users/me?user.fields=created_at,description,verified'

export const X_REDIRECT_URI = process.env.X_REDIRECT_URI || 'https://nukhba.media/api/integrations/x/callback'
const X_CLIENT_ID = process.env.X_CLIENT_ID || ''
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || ''
const X_TOKEN_ENCRYPTION_KEY = process.env.X_TOKEN_ENCRYPTION_KEY || ''
export const X_SCOPES = 'tweet.read users.read tweet.write offline.access'

type XTokenResponse = {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
}

type XMeResponse = {
  data?: { id?: string; username?: string; name?: string }
}

function encryptionKey(): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(X_TOKEN_ENCRYPTION_KEY)) {
    throw new Error('X_TOKEN_ENCRYPTION_KEY must be a 32-byte hexadecimal value')
  }
  return Buffer.from(X_TOKEN_ENCRYPTION_KEY, 'hex')
}

function seal(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

function unseal(value: string): string {
  const [version, ivPart, tagPart, encryptedPart] = value.split('.')
  if (version !== 'v1' || !ivPart || !tagPart || !encryptedPart) throw new Error('Invalid X token cipher text')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function xConfigured(): boolean {
  return Boolean(X_CLIENT_ID && X_CLIENT_SECRET && /^[a-f0-9]{64}$/i.test(X_TOKEN_ENCRYPTION_KEY))
}

export function createPkceVerifier(): string {
  return randomBytes(48).toString('base64url')
}

function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function buildXAuthorizeUrl(state: string, verifier: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: X_CLIENT_ID,
    redirect_uri: X_REDIRECT_URI,
    scope: X_SCOPES,
    state,
    code_challenge: createPkceChallenge(verifier),
    code_challenge_method: 'S256',
  })
  return `${X_AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeToken(values: URLSearchParams): Promise<XTokenResponse> {
  const credentials = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')
  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: values.toString(),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`X token exchange failed (${response.status})`)
  return response.json() as Promise<XTokenResponse>
}

async function saveTokens(tokens: XTokenResponse) {
  const meResponse = await fetch(X_ME_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: 'no-store',
  })
  const me = meResponse.ok ? await meResponse.json() as XMeResponse : null
  const service = await createServiceRoleClient()
  const { data: existing } = await service
    .from('x_oauth_tokens')
    .select('refresh_token_encrypted')
    .eq('id', true)
    .maybeSingle()
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Math.max(tokens.expires_in - 60, 0) * 1000).toISOString()
    : null
  const { error } = await service.from('x_oauth_tokens').upsert({
    id: true,
    access_token_encrypted: seal(tokens.access_token),
    refresh_token_encrypted: tokens.refresh_token ? seal(tokens.refresh_token) : existing?.refresh_token_encrypted ?? null,
    token_type: tokens.token_type ?? 'Bearer',
    scope: tokens.scope ?? X_SCOPES,
    expires_at: expiresAt,
    x_user_id: me?.data?.id ?? null,
    x_username: me?.data?.username ?? null,
    x_name: me?.data?.name ?? null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw new Error(`Unable to save X connection: ${error.message}`)
}

export async function exchangeXAuthorizationCode(code: string, verifier: string): Promise<void> {
  const tokens = await exchangeToken(new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: X_REDIRECT_URI,
    code_verifier: verifier,
  }))
  await saveTokens(tokens)
}

export async function getXAccessToken(): Promise<string> {
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('x_oauth_tokens').select('*').eq('id', true).maybeSingle()
  if (error || !data?.access_token_encrypted) throw new Error('X account is not connected')
  const isFresh = data.expires_at && new Date(data.expires_at).getTime() > Date.now()
  if (isFresh) return unseal(data.access_token_encrypted)
  if (!data.refresh_token_encrypted) throw new Error('X connection expired. Reconnect the account.')

  const refreshed = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: unseal(data.refresh_token_encrypted),
    client_id: X_CLIENT_ID,
  }))
  await saveTokens(refreshed)
  return refreshed.access_token
}

export async function getXConnection() {
  const service = await createServiceRoleClient()
  const { data } = await service
    .from('x_oauth_tokens')
    .select('x_username,x_name,x_user_id,connected_at,updated_at')
    .eq('id', true)
    .maybeSingle()
  return data ?? null
}

export async function xApiFetch<T>(path: string): Promise<T> {
  return xApiRequest<T>(path)
}

export async function xApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getXAccessToken()
  const response = await fetch(`https://api.x.com/2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`X API request failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`)
  }
  return response.json() as Promise<T>
}
