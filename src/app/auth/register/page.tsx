'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import TurnstileWidget from '@/components/ui/TurnstileWidget'
import { turnstileEnabled } from '@/lib/turnstile'
import { validateEmail } from '@/lib/email-validation'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaOn = turnstileEnabled()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEmailSuggestion(null)

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      setError(emailCheck.error ?? 'البريد غير صحيح')
      if (emailCheck.suggestion) setEmailSuggestion(emailCheck.suggestion)
      return
    }
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    if (password !== confirmPassword) { setError('كلمة المرور وتأكيدها غير متطابقتين'); return }
    if (captchaOn && !captchaToken) { setError('يرجى إكمال التحقق الأمني أولاً'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, captchaToken }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'تعذّر إنشاء الحساب'); setLoading(false); return }

      // Auto-login then go to the dashboard
      await supabase.auth.signInWithPassword({ email, password })
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-black text-green mb-2">تواصل النخبة</h1>
          </Link>
          <p className="text-muted text-sm">إنشاء حساب جديد</p>
        </div>

        <form onSubmit={handleRegister} className="bg-card rounded-2xl p-6 md:p-8 border border-border space-y-4">
          <Input id="fullName" label="الاسم الكامل" placeholder="أدخل اسمك الكامل"
            value={fullName} onChange={e => setFullName(e.target.value)} required />
          <Input id="email" label="البريد الإلكتروني" type="email" dir="ltr"
            placeholder="email@example.com" value={email}
            onChange={e => setEmail(e.target.value)} required />
          <Input id="password" label="كلمة المرور" type="password" dir="ltr"
            placeholder="6 أحرف على الأقل" value={password}
            onChange={e => setPassword(e.target.value)} required />
          <Input id="confirmPassword" label="تأكيد كلمة المرور" type="password" dir="ltr"
            placeholder="أعد كتابة كلمة المرور" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)} required />

          {captchaOn && (
            <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
          )}

          {error && (
            <div className="text-sm text-center space-y-2">
              <p className="text-red-500">{error}</p>
              {emailSuggestion && (
                <button type="button"
                  onClick={() => { setEmail(emailSuggestion); setEmailSuggestion(null); setError('') }}
                  className="text-green hover:underline cursor-pointer text-xs">
                  استخدم {emailSuggestion}
                </button>
              )}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full"
            disabled={captchaOn && !captchaToken}>
            إنشاء الحساب
          </Button>

          <p className="text-center text-sm text-muted">
            لديك حساب؟{' '}
            <Link href="/auth/login" className="text-green hover:underline">تسجيل الدخول</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
