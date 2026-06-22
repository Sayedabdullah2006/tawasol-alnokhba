'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface Candidate { id: string; source: string; title: string | null; category: string | null; image_url: string }
interface Newsletter {
  id: string; label: string; image_url: string; caption: string | null
  status: string; scheduled_for: string | null; published: boolean; created_at: string
}
interface Upcoming { endUtc: string; label: string; newsletter: Newsletter | null }

const SOURCE_LABEL: Record<string, string> = { daily: 'خطة النشر', standalone: 'استوديو مستقل', request: 'طلب' }
const STATUS: Record<string, { t: string; c: string }> = {
  draft: { t: 'مسودة', c: 'bg-yellow-100 text-yellow-700' },
  scheduled: { t: 'مجدولة', c: 'bg-blue-100 text-blue-700' },
  published: { t: 'منشورة', c: 'bg-green-100 text-green-700' },
}

export default function AdminNewsletterPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [history, setHistory] = useState<Newsletter[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])

  // البوب-أب
  const [target, setTarget] = useState<Upcoming | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<{ id: string; imageUrl: string; caption: string } | null>(null)
  const [captionEdit, setCaptionEdit] = useState('')
  const [approving, setApproving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/newsletter')
    if (res.ok) {
      const d = await res.json()
      setUpcoming(d.upcoming ?? [])
      setHistory(d.history ?? [])
      setCandidates(d.candidates ?? [])
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

  const openModal = (u: Upcoming) => { setTarget(u); setSelected([]); setDraft(null); setCaptionEdit('') }
  const closeModal = () => { if (!generating && !approving) { setTarget(null); setDraft(null) } }

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 7 ? prev : [...prev, id]))

  const generate = async () => {
    if (!target) return
    if (!selected.length) { showToast('اختر تصميماً واحداً على الأقل', 'error'); return }
    setGenerating(true); setDraft(null)
    try {
      const res = await fetch('/api/admin/newsletter/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected, scheduledFor: target.endUtc }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setDraft({ id: d.id, imageUrl: d.imageUrl, caption: d.caption }); setCaptionEdit(d.caption ?? ''); showToast('تم توليد المعاينة ✅', 'success') }
      else showToast(d.error ?? 'فشل التوليد', 'error')
    } finally { setGenerating(false) }
  }

  const approve = async () => {
    if (!draft) return
    setApproving(true)
    try {
      const res = await fetch('/api/admin/newsletter/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, caption: captionEdit }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { showToast('تم الاعتماد والجدولة — ستُنشر تلقائياً يوم الجمعة 🗓️', 'success'); setTarget(null); setDraft(null); load() }
      else showToast(d.error ?? 'فشل الاعتماد', 'error')
    } finally { setApproving(false) }
  }

  if (loading) return <div className="p-6 flex justify-center"><LoadingSpinner /></div>

  const card = 'bg-card rounded-2xl border border-border overflow-hidden'

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-dark">🗞️ نشرة «النخبة في ٧»</h1>
        <p className="text-sm text-muted mt-1">جهّز نشرة كل جمعة: اختر التصاميم، ولّد البوستر والنص، ثم اعتمدها لتُنشر تلقائياً ١:٠٥م.</p>
      </div>

      {/* الجدولات القادمة */}
      <div className={card}>
        <div className="px-5 py-3 bg-dark/5 font-bold text-dark">الجدولات القادمة</div>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs">
            <tr className="border-b border-border">
              <th className="text-right px-4 py-2 font-medium">أسبوع النشر</th>
              <th className="text-right px-4 py-2 font-medium">الحالة</th>
              <th className="text-right px-4 py-2 font-medium">المعاينة</th>
              <th className="text-left px-4 py-2 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map(u => {
              const n = u.newsletter
              const st = n ? (STATUS[n.status] ?? { t: n.status, c: 'bg-gray-100 text-gray-600' }) : null
              return (
                <tr key={u.endUtc} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-bold text-dark">{u.label}</td>
                  <td className="px-4 py-3">
                    {st ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.c}`}>{st.t}</span>
                        : <span className="text-[11px] text-muted">لم تُجهّز</span>}
                  </td>
                  <td className="px-4 py-3">
                    {n?.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={n.image_url} alt="" className="w-10 rounded border border-border" />
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <Button onClick={() => openModal(u)} size="sm" variant={n ? 'outline' : 'primary'}>
                      {n ? '🔄 إعادة التجهيز' : '⚡ تجهيز'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* السجل */}
      <div className={card}>
        <div className="px-5 py-3 bg-dark/5 font-bold text-dark">السجل</div>
        {history.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted text-center">لا توجد نشرات بعد.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
            {history.map(n => {
              const st = STATUS[n.status] ?? { t: n.status, c: 'bg-gray-100 text-gray-600' }
              return (
                <a key={n.id} href={n.image_url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border overflow-hidden hover:border-green transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.image_url} alt={n.label} className="w-full aspect-[9/16] object-cover" />
                  <div className="p-2">
                    <div className="text-[11px] font-bold text-dark">{n.label}</div>
                    <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.c}`}>{st.t}</span>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>

      {/* البوب-أب: اختيار التصاميم + التوليد + الاعتماد */}
      {target && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={closeModal}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-black text-dark">تجهيز نشرة — {target.label}</h3>
              <button onClick={closeModal} className="w-8 h-8 rounded-full hover:bg-muted/10 text-lg">✕</button>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {!draft ? (
                <>
                  <p className="text-xs text-muted">اختر حتى ٧ تصاميم (بالترتيب) من أحدث التصاميم المولّدة — المحدد: {selected.length}/7</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {candidates.map(c => {
                      const i = selected.indexOf(c.id)
                      return (
                        <button key={c.id} type="button" onClick={() => toggleSelect(c.id)}
                          className={`relative text-right rounded-lg overflow-hidden border-2 ${i >= 0 ? 'border-green ring-2 ring-green/30' : 'border-border'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.image_url} alt={c.title ?? ''} className="w-full aspect-[4/5] object-cover" />
                          {i >= 0 && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>}
                          <span className="absolute top-1 left-1 bg-black/60 text-white text-[8px] rounded px-1">{SOURCE_LABEL[c.source] ?? c.source}</span>
                          <div className="p-1.5"><div className="text-[10px] font-bold text-dark line-clamp-2">{c.title}</div></div>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4 flex-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={draft.imageUrl} alt="المعاينة" className="w-48 rounded-xl border border-border" />
                    <div className="flex-1 min-w-[220px] space-y-2">
                      <label className="block text-xs font-bold text-dark">النص المرافق (عدّله قبل الاعتماد):</label>
                      <textarea value={captionEdit} onChange={e => setCaptionEdit(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[160px] resize-y" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border flex gap-2">
              {!draft ? (
                <Button onClick={generate} loading={generating} disabled={generating || !selected.length} className="flex-1">🎨 توليد التصميم</Button>
              ) : (
                <>
                  <Button onClick={approve} loading={approving} disabled={approving} className="flex-1">✅ اعتماد وجدولة</Button>
                  <Button onClick={() => setDraft(null)} variant="outline" disabled={approving}>↩︎ تغيير الاختيار</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
