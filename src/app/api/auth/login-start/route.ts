// إرسال رمز دخول لمرة واحدة (دخول بلا كلمة مرور) عبر البريد.
// نولّد الرمز عبر Supabase (generateLink) ونرسله بأنفسنا عبر Resend، ثم يتحقق
// منه العميل بـ verifyOtp — دون تغيير كلمة مرور المستخدم ولا تخزين إضافي.
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendLoginCode } from '@/lib/email'
import { validateEmail } from '@/lib/email-validation'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: Request) {
  try {
    const { email, captchaToken } = await request.json()
    if (!email) return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined
    if (!(await verifyTurnstileToken(captchaToken, ip))) {
      return NextResponse.json({ error: 'فشل التحقق الأمني — أعد المحاولة' }, { status: 400 })
    }

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json({ error: emailCheck.error ?? 'البريد غير صحيح' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const supabase = await createServiceRoleClient()

    // نولّد الرمز فقط لمستخدم موجود، ونعيد رسالة موحّدة لتجنّب كشف البريد.
    const { data: users } = await supabase.auth.admin.listUsers()
    const target = users?.users?.find(u => u.email?.toLowerCase() === normalizedEmail)

    if (target) {
      const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
      })
      const otp = (link as { properties?: { email_otp?: string } } | null)?.properties?.email_otp
      if (!linkErr && otp) {
        sendLoginCode({ email: normalizedEmail, code: otp, ttlMinutes: 60 })
          .then(ok => console.log(`Login code for ${normalizedEmail}: ${ok ? 'SENT' : 'FAILED'}`))
          .catch(e => console.error('Login code email failed:', e))
      } else if (linkErr) {
        console.error('generateLink error:', linkErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'إن كان هذا البريد مسجّلاً، سيصلك رمز الدخول خلال دقائق',
    })
  } catch (err) {
    console.error('Login-start error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
