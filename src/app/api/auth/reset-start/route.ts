import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendResetPasswordCode } from '@/lib/email'
import { generateCode, codeExpiryISO, CODE_TTL_MINUTES } from '@/lib/auth-codes'
import { validateEmail } from '@/lib/email-validation'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })

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
      }).catch(e => console.error('Reset code email failed:', e))
    }

    // Neutral success response regardless of existence
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Reset-start error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
