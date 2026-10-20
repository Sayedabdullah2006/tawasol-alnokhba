'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import RequestCard from '@/components/dashboard/RequestCard'
import EmptyState from '@/components/ui/EmptyState'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Link from 'next/link'
import type { PublishRequest } from '@/types/publish-request'
import PortalIntro from '@/components/layout/PortalIntro'
import { isActionRequiredForClient, isFinalStatus } from '@/lib/status-labels'
import type { RequestStatus } from '@/lib/constants'

export default function DashboardPage() {
  const router = useRouter()
  const [supabase] = useState(createClient)
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [requests, setRequests] = useState<PublishRequest[]>([])
  const [view, setView] = useState<'all' | 'action' | 'active' | 'done'>('all')

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

      setRequests((reqs ?? []) as PublishRequest[])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  if (loading) return <LoadingSpinner size="lg" />
  const matches = (request: PublishRequest, tab: typeof view) => tab === 'all' || (tab === 'action' ? isActionRequiredForClient(request.status as RequestStatus) : tab === 'done' ? request.status === 'completed' : !isFinalStatus(request.status as RequestStatus))
  const visible = requests.filter(request => matches(request, view))

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      <PortalIntro title={`مرحبًا، ${userName}`} eyebrow="مساحتك في النخبة">
        <Link href="/request/start" className="portal-primary rounded-xl px-5 py-3 text-sm font-bold">＋ طلب جديد</Link>
      </PortalIntro>
      {!!requests.length && <nav aria-label="تصفية طلباتي" className="portal-toolbar flex flex-wrap gap-2">{([{ id: 'all', label: 'كل الطلبات' }, { id: 'action', label: 'بانتظارك' }, { id: 'active', label: 'الطلبات الجارية' }, { id: 'done', label: 'المكتملة' }] as const).map(tab => <button key={tab.id} type="button" aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>{tab.label}<span className="mr-2 opacity-65">{requests.filter(request => matches(request, tab.id)).length}</span></button>)}</nav>}

      {requests.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات بعد"
          description="قدّم طلبك الأول وابدأ بنشر إنجازاتك"
          actionLabel="قدّم طلبك الأول"
          actionHref="/request/start"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(r => <RequestCard key={r.id} request={r} />)}
          {!visible.length && <p className="portal-panel col-span-full rounded-2xl border p-8 text-center text-sm text-muted">لا توجد طلبات في هذه القائمة</p>}
        </div>
      )}
    </div>
  )
}
