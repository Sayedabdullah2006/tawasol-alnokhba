'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StandaloneStudio from '@/components/admin/StandaloneStudio'

export default function AdminStandaloneStudioPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      setLoading(false)
    }
    check()
  }, [supabase, router])

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <div className="mb-5">
          <Link href="/admin/requests" className="inline-flex items-center gap-2 text-green hover:underline mb-3">← العودة للطلبات</Link>
          <h1 className="text-2xl font-black text-dark">🤖 استوديو الذكاء الاصطناعي (مستقل)</h1>
          <p className="text-muted text-sm">أدخل الخبر ونفّذ الخطوات يدوياً لتوليد المحتوى والتصاميم — بلا حاجة لطلب.</p>
        </div>
        <StandaloneStudio />
      </div>
    </div>
  )
}
