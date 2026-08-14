'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import TurnstileWidget from '@/components/ui/TurnstileWidget'
import { turnstileEnabled } from '@/lib/turnstile'
import { validateEmail } from '@/lib/email-validation'
import { COUNTRIES, countryByCode, flagEmoji } from '@/lib/countries'

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [countryCode, setCountryCode] = useState('SA') // مفتاح الدولة (افتراضي السعودية)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaOn = turnstileEnabled()

  // وجهة العودة بعد التسجيل (مثلاً /request) — تُقرأ من ?next=
  const requestedNext = searchParams.get('next')
  const nextParam = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : ''
  const loginHref = nextParam ? `/auth/login?next=${encodeURIComponent(nextParam)}` : '/auth/login'

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
    // الرقم الوطني: أرقام فقط مع إزالة الأصفار البادئة (الصفر الجذعي)، ثم نضيف مفتاح الدولة
    const dial = countryByCode(countryCode).dial
    const national = phone.replace(/\D/g, '').replace(/^0+/, '')
    if (!national) { setError('أدخل رقم الجوال'); return }
    if (countryCode === 'SA') {
      if (!/^5\d{8}$/.test(national)) { setError('رقم الجوال السعودي يجب أن يكون بصيغة 05XXXXXXXX'); return }
    } else if (national.length < 4 || national.length > 14) {
      setError('رقم الجوال غير صحيح'); return
    }
    const fullPhone = `+${dial}${national}`
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    if (password !== confirmPassword) { setError('كلمة المرور وتأكيدها غير متطابقتين'); return }
    if (captchaOn && !captchaToken) { setError('يرجى إكمال التحقق الأمني أولاً'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, phone: fullPhone, captchaToken }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'تعذّر إنشاء الحساب'); setLoading(false); return }

      // Auto-login then return to the intended destination (e.g. /request) or dashboard
      await supabase.auth.signInWithPassword({ email, password })
      router.push(nextParam || '/dashboard')
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
          <Input id="fullName" label="الاسم الكامل *" placeholder="أدخل اسمك الكامل"
            value={fullName} onChange={e => setFullName(e.target.value)} required />
          <Input id="email" label="البريد الإلكتروني *" type="email" dir="ltr"
            placeholder="email@example.com" value={email}
            onChange={e => setEmail(e.target.value)} required />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium text-dark">رقم الجوال *</label>
            <div className="flex gap-2" dir="ltr">
              <select
                aria-label="مفتاح الدولة"
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                className="shrink-0 max-w-[40%] px-2 py-3 rounded-xl border border-border bg-card text-dark text-[14px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-green/30 focus:border-green"
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {flagEmoji(c.code)} {c.name} (+{c.dial})
                  </option>
                ))}
              </select>
              <Input id="phone" type="tel" dir="ltr" className="flex-1"
                placeholder={countryCode === 'SA' ? '05XXXXXXXX' : 'رقم الجوال'} value={phone}
                onChange={e => setPhone(e.target.value)} required />
            </div>
            <p className="text-xs text-muted" dir="ltr">
              سيُحفظ بصيغة دولية: +{countryByCode(countryCode).dial} {phone.replace(/\D/g, '').replace(/^0+/, '') || '…'}
            </p>
          </div>
          <Input id="password" label="كلمة المرور *" type="password" dir="ltr"
            placeholder="6 أحرف على الأقل" value={password}
            onChange={e => setPassword(e.target.value)} required />
          <Input id="confirmPassword" label="تأكيد كلمة المرور *" type="password" dir="ltr"
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
            <Link href={loginHref} className="text-green hover:underline">تسجيل الدخول</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
