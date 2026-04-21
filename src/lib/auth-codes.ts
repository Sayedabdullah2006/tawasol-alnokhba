// Shared helpers for verification codes used by both the register and
// password-reset flows. Keeps the TTL + attempt caps in one place.

export const CODE_TTL_MINUTES = 10
export const MAX_ATTEMPTS = 5

export function generateCode(): string {
  // 6 digits, always zero-padded
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function codeExpiryISO(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + CODE_TTL_MINUTES)
  return d.toISOString()
}
