'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    })

    if (resetError) {
      setError('حدث خطأ، تأكد من صحة البريد الإلكتروني')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-black text-green mb-2">تواصل النخبة</h1>
          </Link>
          <p className="text-muted text-sm">استعادة كلمة المرور</p>
        </div>

        <div className="bg-card rounded-2xl p-6 md:p-8 border border-border">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="text-lg font-bold text-dark mb-2">تم الإرسال!</h2>
              <p className="text-sm text-muted mb-6">
                تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني
              </p>
              <Link href="/auth/login">
                <Button variant="outline">العودة لتسجيل الدخول</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
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
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                إرسال رابط الاستعادة
              </Button>
              <p className="text-center text-sm">
                <Link href="/auth/login" className="text-green hover:underline">
                  العودة لتسجيل الدخول
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
