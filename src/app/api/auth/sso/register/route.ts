import { after, NextResponse } from 'next/server'
import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { validateEmail } from '@/lib/email-validation'
import { validSsoOrigin } from '@/lib/sso'
import { consumeSsoAttempt } from '@/lib/sso-attempt'
import { provePassword } from '@/lib/auth-password-proof'
import { createFirst1SaudiSignup, notifyFirst1SaudiSignup } from '@/lib/first1saudi-signup-notification'

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!validSsoOrigin(request)) return NextResponse.json({ error: 'طلب غير مسموح' }, { status: 403, headers })
  try {
    const text = await request.text()
    if (text.length > 16000) return NextResponse.json({ error: 'البيانات أكبر من المسموح' }, { status: 413, headers })
    const body = JSON.parse(text), email = String(body.email ?? '').trim().toLowerCase(), password = String(body.password ?? ''), name = String(body.fullName ?? '').trim(), phone = String(body.phone ?? '').replace(/[\s-]/g, '')
    if (!validateEmail(email).valid || password.length < 10 || password.length > 128 || !name || name.length > 160 || !/^\+\d{7,15}$/.test(phone)) return NextResponse.json({ error: 'تحقق من البريد والاسم والجوال الدولي وكلمة المرور (10 أحرف على الأقل).' }, { status: 400, headers })
    if (!await verifyTurnstileToken(body.captchaToken, request.headers.get('x-forwarded-for')?.split(',')[0].trim())) return NextResponse.json({ error: 'تعذر التحقق الأمني.' }, { status: 400, headers })
    if (!await consumeSsoAttempt(email, request)) return NextResponse.json({ error: 'محاولات كثيرة. انتظر قليلًا قبل المحاولة مجددًا.' }, { status: 429, headers: { ...headers, 'Retry-After': '900' } })
    const db = await createServiceRoleClient(), existing = await db.rpc('auth_user_id_by_email', { p_email: email })
    if (existing.error) throw Error('unavailable')
    let uid: string
    if (existing.data) {
      const account = await db.auth.admin.getUserById(existing.data)
      if (account.error || !account.data.user) throw Error('unavailable')
      if (account.data.user.email_confirmed_at) return NextResponse.json({ error: 'هذا البريد مسجل مسبقًا. استخدم تسجيل الدخول بكلمة المرور.' }, { status: 409, headers })
      // A pending account can resume only with proof of its original password.
      const proof = await provePassword(email, password)
      if (proof.code !== 'email_not_confirmed') return NextResponse.json({ error: 'هذا البريد مسجل مسبقًا. استخدم كلمة المرور الأصلية لإكمال التسجيل.' }, { status: 409, headers })
      const completed = await db.auth.admin.updateUserById(account.data.user.id, {
        email_confirm: true,
        app_metadata: { first1saudi_signup: { version: 1, source: 'first1saudi.net', name, email } },
      })
      if (completed.error || !completed.data.user) throw Error('unavailable')
      uid = completed.data.user.id
    } else {
      const created = await createFirst1SaudiSignup(db, email, password, name, phone)
      uid = created.id
    }
    const profile = await db.from('profiles').update({ full_name: name, phone }).eq('id', uid)
    if (profile.error) throw Error('unavailable')
    // Generate a one-time session hash in server memory. No email or user-facing code is sent.
    const link = await db.auth.admin.generateLink({ type: 'magiclink', email })
    if (link.error || !link.data.properties?.hashed_token || link.data.user.id !== uid) throw Error('unavailable')
    const browser = await createServerSupabaseClient()
    const signed = await browser.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' })
    if (signed.error || signed.data.user?.id !== uid) {
      if (signed.data.user) await browser.auth.signOut({ scope: 'local' })
      throw Error('unavailable')
    }
    const user = signed.data.user
    after(() => notifyFirst1SaudiSignup(user))
    return NextResponse.json({ success: true, authenticated: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'تعذر إكمال التسجيل الآن. إن أنشأت حسابك، استخدم تسجيل الدخول بكلمة المرور.' }, { status: 503, headers })
  }
}
