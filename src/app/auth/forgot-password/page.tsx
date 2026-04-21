'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { validateEmail } from '@/lib/email-validation'

type Step = 'email' | 'code' | 'done'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEmailSuggestion(null)
    const v = validateEmail(email)
    if (!v.valid) {
      setError(v.error ?? 'البريد غير صحيح')
      if (v.suggestion) setEmailSuggestion(v.suggestion)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'تعذّر الإرسال'); setLoading(false); return }
      setStep('code')
      startCooldown()
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
    }
    setLoading(false)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (code.length !== 6) { setError('الرمز يجب أن يكون 6 أرقام'); return }
    if (newPassword.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    if (newPassword !== confirmPassword) { setError('كلمتا المرور غير متطابقتين'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'تعذّر إعادة التعيين'); setLoading(false); return }
      setStep('done')
    } catch {
      setError('حدث خطأ، حاول مرة أخرى')
    }
    setLoading(false)
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
    await fetch('/api/auth/reset-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
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
          <p className="text-muted text-sm">إعادة تعيين كلمة المرور</p>
        </div>

        <div className="bg-card rounded-2xl p-6 md:p-8 border border-border">
          {step === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <p className="text-sm text-muted mb-2">
                أدخل بريدك المسجّل وسنرسل لك رمز إعادة تعيين مكوّن من 6 أرقام.
              </p>
              <Input id="email" label="البريد الإلكتروني" type="email" dir="ltr"
                placeholder="email@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required />

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

              <Button type="submit" loading={loading} className="w-full">إرسال الرمز</Button>

              <p className="text-center text-sm">
                <Link href="/auth/login" className="text-green hover:underline">العودة لتسجيل الدخول</Link>
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="bg-green/5 border border-green/20 rounded-xl p-4 text-center text-sm">
                <p className="text-dark mb-1">📨 إن كان البريد مسجّلاً، أرسلنا الرمز إلى:</p>
                <p className="font-bold text-green" dir="ltr">{email}</p>
                <p className="text-xs text-muted mt-2">الرمز صالح لمدة 10 دقائق</p>
              </div>

              <Input id="code" label="رمز التحقق" dir="ltr" inputMode="numeric"
                maxLength={6} placeholder="000000" value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus required
                className="text-center text-2xl tracking-widest font-mono" />

              <Input id="newPassword" label="كلمة المرور الجديدة" type="password" dir="ltr"
                placeholder="6 أحرف على الأقل" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} required />
              <Input id="confirmPassword" label="تأكيد كلمة المرور" type="password" dir="ltr"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} required />

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <Button type="submit" loading={loading} className="w-full">
                تأكيد وتعيين كلمة المرور
              </Button>

              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => setStep('email')}
                  className="text-muted hover:text-dark cursor-pointer">→ تعديل البريد</button>
                <button type="button" onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="text-green hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline">
                  {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown})` : 'إعادة إرسال الرمز'}
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-lg font-bold text-dark">تم تعيين كلمة المرور</h2>
              <p className="text-sm text-muted">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
              <Button onClick={() => router.push('/auth/login')} className="w-full">
                الذهاب لتسجيل الدخول
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
