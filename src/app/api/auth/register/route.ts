import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendWelcomeEmail } from '@/lib/email'
import { validateEmail } from '@/lib/email-validation'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: Request) {
  try {
    const { email, password, fullName, phone, captchaToken } = await request.json()

    if (!email || !password || !fullName || !phone) {
      return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
    }

    // يقبل الصيغة الدولية E.164 (+مفتاح الدولة ثم الرقم) أو الصيغة السعودية القديمة (05XXXXXXXX)
    const normalizedPhone = String(phone).replace(/[\s-]/g, '')
    const isIntl = /^\+\d{6,15}$/.test(normalizedPhone)
    const isLegacySaudi = /^05\d{8}$/.test(normalizedPhone)
    if (!isIntl && !isLegacySaudi) {
      return NextResponse.json({ error: 'رقم جوال غير صالح' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined
    const captchaOk = await verifyTurnstileToken(captchaToken, ip)
    if (!captchaOk) {
      return NextResponse.json({ error: 'فشل التحقق الأمني — أعد المحاولة' }, { status: 400 })
    }

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json({ error: emailCheck.error ?? 'البريد غير صحيح' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = await createServiceRoleClient()

    // Create user via admin API (bypasses rate limits, no email confirmation needed)
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error || !data?.user) {
      if (error?.message.toLowerCase().includes('already been registered')) {
        return NextResponse.json({ error: 'هذا البريد مسجل مسبقاً' }, { status: 409 })
      }
      console.error('Register error:', error?.message)
      return NextResponse.json({ error: 'حدث خطأ أثناء التسجيل' }, { status: 500 })
    }

    // Update profile
    await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName,
      phone: normalizedPhone,
      role: 'client',
    })

    // The welcome email already CCs the administration.
    await sendWelcomeEmail({ email: normalizedEmail, clientName: fullName })

    return NextResponse.json({ success: true, userId: data.user.id })
  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
