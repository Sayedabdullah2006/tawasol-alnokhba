import type { SupabaseClient, User } from '@supabase/supabase-js'
import { sendEmail } from './email'

const SOURCE = 'first1saudi.net'
const RECIPIENT = 'first1saudi@gmail.com'

/** Only the registration server can set app_metadata; client metadata is not proof of source. */
export async function createFirst1SaudiSignup(db: SupabaseClient, email: string, password: string, name: string, phone: string) {
  const result = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name, phone },
    app_metadata: { first1saudi_signup: { version: 1, source: SOURCE, name, email } },
  })
  if (result.error || !result.data.user) throw Error('FIRST1SAUDI_SIGNUP_SOURCE_UNAVAILABLE')
  return result.data.user
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!))

export function first1SaudiSignupMail(user: User) {
  const signup = user.app_metadata?.first1saudi_signup
  if (!user.email_confirmed_at || !user.email || signup?.source !== SOURCE ||
      signup.email !== user.email || typeof signup.name !== 'string' ||
      signup.version !== 1) return null
  const name = signup.name.replace(/[\r\n\x00-\x1f\x7f]/g, ' ').slice(0, 160)
  const confirmedAt = new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh', calendar: 'gregory',
  }).format(new Date(user.email_confirmed_at))
  return {
    to: RECIPIENT,
    subject: `اكتمل تسجيل مستخدم جديد عبر موقع أول سعودي — ${name}`,
    html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f3f6f2;font-family:Tahoma,Arial,sans-serif;color:#183d2c"><main style="max-width:600px;margin:24px auto;padding:28px;background:white;border-radius:12px"><h1 style="font-size:23px">اكتمل تسجيل مستخدم جديد عبر موقع أول سعودي</h1><p>أكمل المستخدم إنشاء حسابه من خلال موقع <strong>أول سعودي</strong> عبر الدخول الموحد، ودخل إلى حسابه مباشرة.</p><p><strong>مصدر التسجيل:</strong> موقع أول سعودي — <a href="https://www.first1saudi.net/">www.first1saudi.net</a></p><p><strong>الاسم:</strong> ${escapeHtml(name)}</p><p><strong>البريد الإلكتروني:</strong> <span dir="ltr">${escapeHtml(user.email)}</span></p><p><strong>وقت اكتمال التسجيل (توقيت الرياض):</strong> ${escapeHtml(confirmedAt)}</p></main></body></html>`,
    // The shared mail transport stores this receipt durably and also passes provider idempotency.
    notificationKey: `first1saudi-signup:${user.id}`,
  }
}

/** Runs after the login response; email outages must not interrupt a confirmed user's session. */
export async function notifyFirst1SaudiSignup(user: User) {
  try {
    const mail = first1SaudiSignupMail(user)
    if (!mail) return
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await sendEmail(mail.to, mail.subject, mail.html, undefined, 'first1saudi', mail.notificationKey)) return
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
    console.error('FIRST1SAUDI_SIGNUP_NOTIFICATION_UNAVAILABLE')
  } catch {
    console.error('FIRST1SAUDI_SIGNUP_NOTIFICATION_UNAVAILABLE')
  }
}
