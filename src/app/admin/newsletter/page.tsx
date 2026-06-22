'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface Candidate {
  id: string
  post_title: string | null
  category: string | null
  design_image_url: string
  in_newsletter: boolean
  newsletter_rank: number | null
}
interface Latest { label: string; image_url: string; direction: string | null; published: boolean; created_at: string }

export default function AdminNewsletterPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [latest, setLatest] = useState<Latest | null>(null)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/newsletter')
    if (res.ok) {
      const d = await res.json()
      setLabel(d.window?.label ?? '')
      setCandidates(d.candidates ?? [])
      setLatest(d.latest ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      await load()
    }
    init()
  }, [supabase, router, load])

  const togglePick = async (c: Candidate) => {
    const include = !c.in_newsletter
    setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, in_newsletter: include } : x))
    const res = await fetch('/api/admin/newsletter/pick', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, include }),
    })
    if (!res.ok) { showToast('تعذّر الحفظ', 'error'); load() }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/newsletter/generate', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { showToast(`تم توليد المعاينة (${d.count} أخبار) ✅`, 'success'); load() }
      else showToast(d.error ?? 'فشل التوليد', 'error')
    } finally { setGenerating(false) }
  }

  if (loading) return <div className="p-6 flex justify-center"><LoadingSpinner /></div>

  const pickedCount = candidates.filter(c => c.in_newsletter).length
  const card = 'bg-card rounded-2xl border border-border p-5 space-y-3'

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-dark">🗞️ نشرة «النخبة في ٧»</h1>
        <p className="text-sm text-muted mt-1">
          أسبوع: <b>{label}</b> — تُنشر تلقائياً كل جمعة ١:٠٥م. ثبّت أهم الأخبار أدناه (المثبّت أولاً ثم إكمال تلقائي حتى ٧).
        </p>
      </div>

      {/* المعاينة + التوليد اليدوي */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-dark">معاينة البوستر</h2>
          <Button onClick={generate} loading={generating} disabled={generating} size="sm">⚡ ولّد معاينة الآن</Button>
        </div>
        {latest ? (
          <div className="flex gap-4 flex-wrap items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.image_url} alt="النشرة" className="w-48 rounded-xl border border-border" />
            <div className="text-sm text-muted space-y-1">
              <div>الاتجاه: <b className="text-dark">{latest.direction ?? '—'}</b></div>
              <div>الحالة: {latest.published ? '✅ نُشرت' : '🕓 لم تُنشر بعد'}</div>
              <a href={latest.image_url} target="_blank" rel="noopener noreferrer" className="text-green hover:underline inline-block">فتح بالحجم الكامل ↗</a>
            </div>
          </div>
        ) : <p className="text-sm text-muted">لا توجد معاينة بعد — اضغط «ولّد معاينة».</p>}
      </div>

      {/* مرشّحو الأسبوع */}
      <div className={card}>
        <h2 className="font-bold text-dark">مرشّحو الأسبوع ({candidates.length}) — مثبّت: {pickedCount}</h2>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted">لا توجد أخبار مولّدة ضمن نافذة هذا الأسبوع بعد.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {candidates.map(c => (
              <button key={c.id} type="button" onClick={() => togglePick(c)}
                className={`relative text-right rounded-xl overflow-hidden border-2 transition-all ${c.in_newsletter ? 'border-green ring-2 ring-green/30' : 'border-border'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.design_image_url} alt={c.post_title ?? ''} className="w-full aspect-[4/5] object-cover" />
                {c.in_newsletter && <span className="absolute top-1 left-1 bg-green text-white text-[10px] font-bold rounded-full px-2 py-0.5">⭐ مثبّت</span>}
                <div className="p-2">
                  <div className="text-[11px] font-bold text-dark line-clamp-2">{c.post_title}</div>
                  <div className="text-[10px] text-muted">{c.category}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
