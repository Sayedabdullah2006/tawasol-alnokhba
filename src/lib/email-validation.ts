// Email validation + common-typo suggestions for the most-mistyped domains.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const TYPO_DOMAINS: Record<string, string> = {
  // Gmail
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  // Hotmail / Outlook
  'hotmial.com': 'hotmail.com',
  'hotamail.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outloook.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  // Yahoo
  'yhaoo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  // iCloud
  'iclod.com': 'icloud.com',
  'icould.com': 'icloud.com',
}

export interface EmailValidation {
  valid: boolean
  error?: string
  suggestion?: string  // suggested corrected address
}

export function validateEmail(raw: string): EmailValidation {
  const email = raw.trim().toLowerCase()
  if (!email) return { valid: false, error: 'يرجى إدخال البريد الإلكتروني' }
  if (!EMAIL_RE.test(email)) return { valid: false, error: 'صيغة البريد الإلكتروني غير صحيحة' }

  const [local, domain] = email.split('@')
  const suggestedDomain = TYPO_DOMAINS[domain]
  if (suggestedDomain) {
    return {
      valid: false,
      error: `هل قصدت ${local}@${suggestedDomain}؟`,
      suggestion: `${local}@${suggestedDomain}`,
    }
  }

  return { valid: true }
}
