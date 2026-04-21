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

type Step = 'form' | 'code'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('form')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaOn = turnstileEnabled()

  const handleSendCode = async (e: React.FormEvent) => {
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
      const res = await fetch('/api/auth/register-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, captchaToken }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'تعذّر الإرسال'); setLoading(false); return }
      setStep('code')
      startCooldown()
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
    }
    setLoading(false)
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (code.length !== 6) { setError('الرمز يجب أن يكون 6 أرقام'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'الرمز غير صحيح'); setLoading(false); return }

      // Auto-login
      await supabase.auth.signInWithPassword({ email, password })
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
      setLoading(false)
    }
  }

  const startCooldown = () => {
    setResendCooldown(60)
    const iv = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(iv); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return
    setError('')
    setLoading(true)
    await fetch('/api/auth/register-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName }),
    })
    startCooldown()
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-black text-green mb-2">تواصل النخبة</h1>
          </Link>
          <p className="text-muted text-sm">
            {step === 'form' ? 'إنشاء حساب جديد' : 'أدخل رمز التحقق'}
          </p>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleSendCode} className="bg-card rounded-2xl p-6 md:p-8 border border-border space-y-4">
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
              إرسال رمز التحقق
            </Button>

            <p className="text-center text-sm text-muted">
              لديك حساب؟{' '}
              <Link href="/auth/login" className="text-green hover:underline">تسجيل الدخول</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="bg-card rounded-2xl p-6 md:p-8 border border-border space-y-5">
            <div className="bg-green/5 border border-green/20 rounded-xl p-4 text-center text-sm">
              <p className="text-dark mb-1">📨 أرسلنا رمز تحقق مكوّن من 6 أرقام إلى:</p>
              <p className="font-bold text-green" dir="ltr">{email}</p>
              <p className="text-xs text-muted mt-2">الرمز صالح لمدة 10 دقائق</p>
            </div>

            <Input id="code" label="رمز التحقق" dir="ltr" inputMode="numeric"
              maxLength={6} placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus required
              className="text-center text-2xl tracking-widest font-mono" />

            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <Button type="submit" loading={loading} className="w-full">تفعيل الحساب</Button>

            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => setStep('form')}
                className="text-muted hover:text-dark cursor-pointer">→ تعديل البريد</button>
              <button type="button" onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                className="text-green hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline">
                {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown})` : 'إعادة إرسال الرمز'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
