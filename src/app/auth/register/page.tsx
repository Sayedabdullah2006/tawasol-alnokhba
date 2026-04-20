'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { validateEmail } from '@/lib/email-validation'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEmailSuggestion(null)

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      setError(emailCheck.error ?? 'البريد الإلكتروني غير صحيح')
      if (emailCheck.suggestion) setEmailSuggestion(emailCheck.suggestion)
      return
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقتين')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'حدث خطأ أثناء التسجيل')
        setLoading(false)
        return
      }

      // Auto login after registration
      await supabase.auth.signInWithPassword({ email, password })
      setSuccess(true)
    } catch {
      setError('حدث خطأ أثناء التسجيل، حاول مرة أخرى')
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream px-4">
        <div className="w-full max-w-md text-center bg-card rounded-2xl p-8 border border-border">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-dark mb-2">تم التسجيل بنجاح!</h2>
          <p className="text-muted text-sm mb-6">
            تم إنشاء حسابك وتسجيل دخولك تلقائياً
          </p>
          <Link href="/dashboard">
            <Button>الذهاب إلى لوحة التحكم</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-black text-green mb-2">تواصل النخبة</h1>
          </Link>
          <p className="text-muted text-sm">إنشاء حساب جديد</p>
        </div>

        <form onSubmit={handleRegister} className="bg-card rounded-2xl p-6 md:p-8 border border-border space-y-4">
          <Input
            id="fullName"
            label="الاسم الكامل"
            placeholder="أدخل اسمك الكامل"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
          />
          <Input
            id="email"
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            placeholder="email@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            label="كلمة المرور"
            type="password"
            dir="ltr"
            placeholder="6 أحرف على الأقل"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Input
            id="confirmPassword"
            label="تأكيد كلمة المرور"
            type="password"
            dir="ltr"
            placeholder="أعد كتابة كلمة المرور"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />

          {error && (
            <div className="text-sm text-center space-y-2">
              <p className="text-red-500">{error}</p>
              {emailSuggestion && (
                <button
                  type="button"
                  onClick={() => { setEmail(emailSuggestion); setEmailSuggestion(null); setError('') }}
                  className="text-green hover:underline cursor-pointer text-xs"
                >
                  استخدم {emailSuggestion}
                </button>
              )}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
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
