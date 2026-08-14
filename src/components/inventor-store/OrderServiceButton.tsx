'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function OrderServiceButton({ slug, className = '' }: { slug: string; className?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const order = async () => {
    setLoading(true)
    const { data: { user } } = await createClient().auth.getUser()
    const destination = `/inventor-store/order/${slug}`
    router.push(user ? destination : `/auth/login?next=${encodeURIComponent(destination)}`)
  }

  return <button type="button" onClick={order} disabled={loading} className={`inline-flex min-h-12 items-center justify-center rounded-lg bg-green px-6 py-3 text-sm font-black text-white shadow-lg shadow-green/20 transition hover:bg-green/90 disabled:opacity-60 ${className}`}>
    {loading ? 'جارٍ التحقق...' : 'اطلب الخدمة'}
  </button>
}
