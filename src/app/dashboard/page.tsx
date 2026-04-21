'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import RequestCard from '@/components/dashboard/RequestCard'
import EmptyState from '@/components/ui/EmptyState'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

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
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-black text-dark mb-6">مرحباً، {userName} 👋</h1>

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
