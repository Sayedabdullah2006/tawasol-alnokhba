'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/Button'

interface Job { id: string; scope: string; operation: string; status: 'running' | 'failed'; error_message: string | null }

const LABELS: Record<string, string> = {
  analyze: 'تحليل المحتوى', tweets: 'توليد المنشورات', concepts: 'اقتراح الاتجاهات', image: 'توليد التصميم',
  'generate-copy': 'توليد المنشور', 'generate-design': 'توليد التصميم', infographic: 'توليد الإنفوجرافيك', edit: 'تعديل التصميم',
  'occasion-design': 'توليد تصاميم المناسبات',
}

export default function GenerationJobMonitor() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [cancelling, setCancelling] = useState<string | null>(null)
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/generation-jobs', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json().catch(() => ({}))
    setJobs(Array.isArray(data.jobs) ? data.jobs : [])
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => { void load() }, 0)
    const timer = window.setInterval(() => { void load() }, 2500)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [load])

  const cancel = async (id: string) => {
    setCancelling(id)
    try {
      await fetch('/api/admin/generation-jobs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      await load()
    } finally { setCancelling(null) }
  }

  const running = jobs.filter(job => job.status === 'running')
  if (!running.length) return null
  return <div className="fixed bottom-20 left-5 z-[60] w-[min(24rem,calc(100vw-2.5rem))] space-y-2 md:bottom-5" dir="rtl">
    {running.map(job => <div key={job.id} className="flex items-center gap-3 rounded-lg border border-teal-200 bg-white p-3 shadow-lg">
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      <p className="min-w-0 flex-1 text-sm font-bold text-dark">جارٍ {LABELS[job.operation] ?? 'التوليد'} حتى لو غادرت الصفحة</p>
      <Button size="sm" variant="ghost" onClick={() => cancel(job.id)} loading={cancelling === job.id}>إلغاء</Button>
    </div>)}
  </div>
}
