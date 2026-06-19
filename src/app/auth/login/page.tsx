'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import TurnstileWidget from '@/components/ui/TurnstileWidget'
import { turnstileEnabled } from '@/lib/turnstile'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sending, setSending] = useState(false)
  const captchaOn = turnstileEnabled()
  const router = useRouter()
  const supabase = createClient()

  // تمرير وجهة العودة (?next=) إلى رابط إنشاء الحساب حتى يعود العميل لطلبه
  const [nextParam, setNextParam] = useState('')
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('next')
    if (n && n.startsWith('/') && !n.startsWith('//')) setNextParam(n)
  }, [])
  const registerHref = nextParam ? `/auth/register?next=${encodeURIComponent(nextParam)}` : '/auth/register'

  const finishLogin = async (userId: string) => {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    const nextParam = new URLSearchParams(window.location.search).get('next')
    const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null
    router.push(profile?.role === 'admin' ? '/admin' : (safeNext ?? '/dashboard'))
    router.refresh()
  }

  // إرسال رمز الدخول للبريد (دخول بلا كلمة مرور)
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSending(true)
    try {
      const res = await fetch('/api/auth/login-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captchaToken }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'تعذّر إرسال الرمز'); return }
      setCodeSent(true)
    } catch { setError('تعذّر إرسال الرمز — أعد المحاولة') }
    finally { setSending(false) }
  }

  // التحقق من الرمز وإنشاء الجلسة (verifyOtp الأصلي — دون تغيير كلمة المرور)
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error: vErr } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    if (vErr || !data.user) { setError('الرمز غير صحيح أو منتهي الصلاحية'); setLoading(false); return }
    await finishLogin(data.user.id)
  }

  // Debug logging
  console.log('Login Page Debug:', {
    captchaOn,
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? 'SET' : 'NOT SET'
  })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (authError || !authData.user) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setLoading(false)
      return
    }
    await finishLogin(authData.user.id)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-black text-green mb-2">تواصل النخبة</h1>
          </Link>
          <p className="text-muted text-sm">تسجيل الدخول إلى حسابك</p>
        </div>

        <div className="bg-card rounded-2xl p-6 md:p-8 border border-border space-y-4">
          {/* تبديل طريقة الدخول */}
          <div className="grid grid-cols-2 gap-1 bg-cream rounded-xl p-1 text-sm font-bold">
            <button type="button" onClick={() => { setMode('password'); setError('') }}
              className={`py-2 rounded-lg transition ${mode === 'password' ? 'bg-card text-green shadow-sm' : 'text-muted'}`}>
              كلمة المرور
            </button>
            <button type="button" onClick={() => { setMode('code'); setError('') }}
              className={`py-2 rounded-lg transition ${mode === 'code' ? 'bg-card text-green shadow-sm' : 'text-muted'}`}>
              رمز عبر البريد
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input id="email" label="البريد الإلكتروني" type="email" dir="ltr" placeholder="email@example.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
              <Input id="password" label="كلمة المرور" type="password" dir="ltr" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
              {captchaOn && <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />}
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <Button type="submit" loading={loading} className="w-full" disabled={captchaOn && !captchaToken}>
                تسجيل الدخول
              </Button>
            </form>
          ) : (
            <form onSubmit={codeSent ? handleVerifyCode : handleSendCode} className="space-y-4">
              <Input id="email" label="البريد الإلكتروني" type="email" dir="ltr" placeholder="email@example.com"
                value={email} onChange={e => setEmail(e.target.value)} required disabled={codeSent} />
              {!codeSent ? (
                <>
                  <p className="text-xs text-muted leading-relaxed">سنرسل لك رمز دخول لمرة واحدة على بريدك — بلا كلمة مرور.</p>
                  {captchaOn && <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />}
                  {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                  <Button type="submit" loading={sending} className="w-full" disabled={captchaOn && !captchaToken}>
                    أرسل الرمز
                  </Button>
                </>
              ) : (
                <>
                  <Input id="code" label="رمز الدخول" type="text" dir="ltr" inputMode="numeric" placeholder="------"
                    value={code} onChange={e => setCode(e.target.value)} required />
                  <p className="text-xs text-green-700">✅ أرسلنا رمزاً إلى {email}. تحقّق من بريدك (والمهملات).</p>
                  {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                  <Button type="submit" loading={loading} className="w-full">دخول</Button>
                  <button type="button" onClick={() => { setCodeSent(false); setCode(''); setError('') }}
                    className="w-full text-xs text-muted hover:text-dark">تغيير البريد / إعادة الإرسال</button>
                </>
              )}
            </form>
          )}

          <div className="flex justify-between text-sm pt-1">
            <Link href="/auth/forgot-password" className="text-green hover:underline">نسيت كلمة المرور؟</Link>
            <Link href={registerHref} className="text-green hover:underline">إنشاء حساب جديد</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
