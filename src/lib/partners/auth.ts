import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'

export class PartnerError extends Error {
  constructor(public code: string, public status = 400) { super(code) }
}
export interface PartnerClient {
  id: string
  keys: Record<string, string>
  influencer_ids: string[]
  return_url: string
  notifications?: boolean
  auto_studio?: boolean
}
export interface PartnerContext { client: PartnerClient; customer: string; idempotencyKey: string; raw: string }
export function sha256(value: string) { return createHash('sha256').update(value).digest('hex') }
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export function canonicalRequest(method: string, target: string, timestamp: string, nonce: string, customer: string, key: string, raw: string) {
  return [method.toUpperCase(), target, timestamp, nonce, customer, key, sha256(raw)].join('\n')
}
export function configuredClients(): PartnerClient[] {
  let clients: PartnerClient[]
  try { clients = JSON.parse(process.env.PARTNER_API_CLIENTS_JSON ?? '[]') } catch { throw new PartnerError('PARTNER_CONFIG_INVALID', 503) }
  if (!Array.isArray(clients)) throw new PartnerError('PARTNER_CONFIG_INVALID', 503)
  return clients
}
export async function authenticatePartner(request: Request): Promise<PartnerContext> {
  const id = request.headers.get('x-partner-id') ?? ''
  const kid = request.headers.get('x-key-id') ?? ''
  const timestamp = request.headers.get('x-timestamp') ?? ''
  const nonce = request.headers.get('x-nonce') ?? ''
  const customer = request.headers.get('x-customer-id') ?? ''
  const idempotencyKey = request.headers.get('idempotency-key') ?? ''
  const signature = request.headers.get('x-signature') ?? ''
  const client = configuredClients().find(c => c.id === id)
  const secret = client?.keys?.[kid]
  if (!client || typeof secret !== 'string' || secret.length < 32 || !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-zA-Z0-9_-]{16,96}$/.test(nonce) ||
      !/^[a-zA-Z0-9_.:@-]{1,128}$/.test(customer) || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new PartnerError('UNAUTHORIZED', 401)
  }
  if (request.method === 'POST' && !/^[a-zA-Z0-9_.:-]{16,128}$/.test(idempotencyKey)) throw new PartnerError('IDEMPOTENCY_KEY_REQUIRED')
  // Bound the streamed body before parsing; Content-Length alone is not trusted.
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0
  if (reader) for (;;) {
    const next = await reader.read(); if (next.done) break
    bytes += next.value.byteLength
    if (bytes > 128 * 1024) { await reader.cancel(); throw new PartnerError('BODY_TOO_LARGE', 413) }
    chunks.push(next.value)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  const url = new URL(request.url)
  const expected = createHmac('sha256', secret).update(canonicalRequest(request.method, url.pathname + url.search, timestamp, nonce, customer, idempotencyKey, raw)).digest('hex')
  if (!equalSecret(expected, signature)) throw new PartnerError('UNAUTHORIZED', 401)
  const db = await createServiceRoleClient()
  const { data, error } = await db.rpc('partner_accept_nonce', { p_partner: id, p_nonce: nonce })
  if (error) throw new PartnerError(error.message.includes('RATE_LIMITED') ? 'RATE_LIMITED' : 'AUTH_STORAGE_UNAVAILABLE', error.message.includes('RATE_LIMITED') ? 429 : 503)
  if (!data) throw new PartnerError('REPLAY_REJECTED', 409)
  return { client, customer, idempotencyKey, raw }
}
export function parseBody(ctx: PartnerContext): Record<string, unknown> {
  try {
    const body = JSON.parse(ctx.raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch { throw new PartnerError('INVALID_JSON') }
}
export function text(value: unknown, max: number, required = true): string {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new PartnerError('INVALID_INPUT')
  return value.trim()
}
export function uuid(value: unknown) {
  const result = text(value, 36)
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result)) throw new PartnerError('INVALID_ID')
  return result
}
