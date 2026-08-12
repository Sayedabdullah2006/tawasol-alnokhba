'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import RequestCard from '@/components/dashboard/RequestCard'
import EmptyState from '@/components/ui/EmptyState'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [requests, setRequests] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      setUserName(prof?.full_name ?? 'مستخدم')

      const { data: reqs } = await supabase
        .from('publish_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setRequests(reqs ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <section className="glass-panel mb-5 flex flex-wrap items-end justify-between gap-4 rounded-lg p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold text-gold">مساحة العميل</p>
          <h1 className="mt-1 text-2xl font-black text-dark sm:text-3xl">مرحباً، {userName}</h1>
          <p className="mt-2 text-sm text-muted">تابع طلباتك واعتمد المحتوى في مكان واحد.</p>
        </div>
        <Link href="/request" className="rounded-lg bg-green px-5 py-3 text-sm font-bold text-white shadow-md shadow-green/20 transition hover:bg-green/90">+ تقديم طلب جديد</Link>
      </section>

      {requests.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات بعد"
          description="قدّم طلبك الأول وابدأ بنشر إنجازاتك"
          actionLabel="قدّم طلبك الأول"
          actionHref="/request"
        />
      ) : (
        <div className="grid gap-3">
          {requests.map(r => <RequestCard key={r.id} request={r} />)}
        </div>
      )}
    </div>
  )
}
