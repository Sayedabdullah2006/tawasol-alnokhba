'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setLoading(false)
      return
    }

    // Check if admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profile?.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
    router.refresh()
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

        <form onSubmit={handleLogin} className="bg-card rounded-2xl p-6 md:p-8 border border-border space-y-4">
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
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            تسجيل الدخول
          </Button>

          <div className="flex justify-between text-sm">
            <Link href="/auth/forgot-password" className="text-green hover:underline">
              نسيت كلمة المرور؟
            </Link>
            <Link href="/auth/register" className="text-green hover:underline">
              إنشاء حساب جديد
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
