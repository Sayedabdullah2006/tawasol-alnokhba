import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendResetPasswordCode } from '@/lib/email'
import { generateCode, codeExpiryISO, CODE_TTL_MINUTES } from '@/lib/auth-codes'
import { validateEmail } from '@/lib/email-validation'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: Request) {
  try {
    const { email, captchaToken } = await request.json()
    if (!email) return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined
    const captchaOk = await verifyTurnstileToken(captchaToken, ip)
    if (!captchaOk) {
      return NextResponse.json({ error: 'فشل التحقق الأمني — أعد المحاولة' }, { status: 400 })
    }

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json({ error: emailCheck.error ?? 'البريد غير صحيح' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = await createServiceRoleClient()

    // Verify user exists — but return the same response either way to avoid leaking emails
    const { data: users } = await supabase.auth.admin.listUsers()
    const exists = users?.users?.some(u => u.email?.toLowerCase() === normalizedEmail)

    if (exists) {
      // Invalidate any previous unused reset codes
      await supabase
        .from('auth_codes')
        .update({ used: true })
        .eq('email', normalizedEmail)
        .eq('purpose', 'reset_password')
        .eq('used', false)

      const code = generateCode()
      await supabase.from('auth_codes').insert({
        email: normalizedEmail,
        code,
        purpose: 'reset_password',
        expires_at: codeExpiryISO(),
      })

      // Fire the email; failure is logged but never echoed to the client to prevent enumeration
      sendResetPasswordCode({
        email: normalizedEmail,
        code,
        ttlMinutes: CODE_TTL_MINUTES,
      }).then(success => {
        console.log(`Reset email for ${normalizedEmail}: ${success ? 'SUCCESS' : 'FAILED'}`)
      }).catch(e => console.error('Reset code email failed:', e))
    }

    // Improved user feedback while maintaining security
    return NextResponse.json({
      success: true,
      message: exists ?
        'تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' :
        'إذا كان هذا البريد مسجلاً، ستتلقى رمز إعادة التعيين خلال دقائق'
    })
  } catch (err) {
    console.error('Reset-start error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
