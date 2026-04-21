import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendRegistrationCode } from '@/lib/email'
import { generateCode, codeExpiryISO, CODE_TTL_MINUTES } from '@/lib/auth-codes'
import { validateEmail } from '@/lib/email-validation'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: Request) {
  try {
    const { email, password, fullName, captchaToken } = await request.json()

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
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

    // Reject if an account already exists for this email
    const { data: existing } = await supabase.auth.admin.listUsers()
    if (existing?.users?.some(u => u.email?.toLowerCase() === normalizedEmail)) {
      return NextResponse.json({ error: 'هذا البريد مسجل مسبقاً' }, { status: 409 })
    }

    // Invalidate any previous unused register codes for this email
    await supabase
      .from('auth_codes')
      .update({ used: true })
      .eq('email', normalizedEmail)
      .eq('purpose', 'register')
      .eq('used', false)

    const code = generateCode()
    const { error: insertErr } = await supabase.from('auth_codes').insert({
      email: normalizedEmail,
      code,
      purpose: 'register',
      full_name: fullName,
      password,
      expires_at: codeExpiryISO(),
    })

    if (insertErr) {
      console.error('Register-start insert error:', insertErr)
      return NextResponse.json({ error: 'تعذّر إنشاء طلب التسجيل' }, { status: 500 })
    }

    console.log(`Attempting to send registration email to: ${normalizedEmail}`)
    const emailOk = await sendRegistrationCode({
      email: normalizedEmail,
      code,
      clientName: fullName,
      ttlMinutes: CODE_TTL_MINUTES,
    })
    console.log(`Registration email result for ${normalizedEmail}: ${emailOk ? 'SUCCESS' : 'FAILED'}`)

    if (!emailOk) {
      console.error(`Registration email failed for: ${normalizedEmail}`)
      return NextResponse.json({ error: 'تعذّر إرسال رمز التحقق — تأكد من بريدك وأن nukhba.media مفعّل في Resend' }, { status: 500 })
    }

    return NextResponse.json({ success: true, email: normalizedEmail })
  } catch (err) {
    console.error('Register-start error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
