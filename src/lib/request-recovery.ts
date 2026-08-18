import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const EMAIL_TOKEN_PREFIX = 'r'

function signingSecret(): string {
  const secret = process.env.REQUEST_RECOVERY_SECRET
    || process.env.CRON_API_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Request recovery signing secret is not configured')
  return secret
}

export function hashRecoverySecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function createDraftAccess(id: string): { token: string; tokenHash: string } {
  const secret = randomBytes(32).toString('base64url')
  return { token: `${id}.${secret}`, tokenHash: hashRecoverySecret(secret) }
}

export function createEmailResumeToken(id: string): string {
  const signature = createHmac('sha256', signingSecret()).update(`resume:${id}`).digest('base64url')
  return `${EMAIL_TOKEN_PREFIX}.${id}.${signature}`
}

export type ParsedRecoveryToken = {
  id: string
  localSecret?: string
  emailSigned: boolean
}

export function parseRecoveryToken(token: string): ParsedRecoveryToken | null {
  const parts = token.trim().split('.')
  if (parts.length === 2) {
    const [id, localSecret] = parts
    return id && localSecret ? { id, localSecret, emailSigned: false } : null
  }
  if (parts.length !== 3 || parts[0] !== EMAIL_TOKEN_PREFIX) return null
  const [, id, signature] = parts
  if (!id || !signature) return null
  const expected = createHmac('sha256', signingSecret()).update(`resume:${id}`).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  return { id, emailSigned: true }
}

export function verifyLocalRecoverySecret(secret: string, storedHash: string): boolean {
  const actual = Buffer.from(hashRecoverySecret(secret), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function normalizeRecoveryEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function makeRecoveryCode(): string {
  return `RETURN-${randomBytes(4).toString('hex').toUpperCase()}`
}
