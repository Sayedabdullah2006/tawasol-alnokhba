'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface ScheduleItem {
  id: string
  wp_post_id: number
  post_url: string
  post_title: string
  category: string | null
  source: string | null
  source_image_url: string | null
  design_image_url: string | null
  tweets: string | null
  batch_date: string
  status: string
  email_sent: boolean
  created_at: string
}

function formatArabicDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ar', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory',
  })
}

export default function AdminSocialPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  // جدولة النشر
  const [schedId, setSchedId] = useState<string | null>(null)
  const [schedWhen, setSchedWhen] = useState('')
  const [schedText, setSchedText] = useState('')
  const [schedBusy, setSchedBusy] = useState(false)

  const submitSchedule = async (item: ScheduleItem) => {
    if (!schedWhen) { alert('حدّد تاريخ ووقت الجدولة'); return }
    setSchedBusy(true)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: schedText, imageUrl: item.design_image_url, scheduledLocal: schedWhen }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'فشل الجدولة')
      const n = Array.isArray(json.accountIds) ? json.accountIds.length : 0
      alert(`تمت الجدولة في ${n} قناة بتوقيت السعودية ✅`)
      setSchedId(null); setSchedWhen(''); setSchedText('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'فشل الجدولة')
    } finally {
      setSchedBusy(false)
    }
  }

  const load = async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/social-schedule')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل التحميل')
      setItems(json.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل')
    }
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      await load()
      setLoading(false)
    }
    init()
  }, [supabase, router])

  const copyTweets = async (item: ScheduleItem) => {
    if (!item.tweets) return
    try {
      await navigator.clipboard.writeText(item.tweets)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* ignore */ }
  }

  const regenerate = async (item: ScheduleItem) => {
    setBusyId(item.id)
    try {
      const res = await fetch('/api/admin/social-schedule/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, note }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل إعادة التوليد')
      setItems(prev => prev.map(it =>
        it.id === item.id ? { ...it, design_image_url: json.design_image_url, tweets: json.tweets } : it,
      ))
      setOpenId(null)
      setNote('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'فشل إعادة التوليد')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />

  // تجميع حسب اليوم
  const byDate = new Map<string, ScheduleItem[]>()
  for (const it of items) {
    if (!byDate.has(it.batch_date)) byDate.set(it.batch_date, [])
    byDate.get(it.batch_date)!.push(it)
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1))

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-dark">🗓️ خطة النشر اليومية</h1>
          <p className="text-sm text-muted mt-0.5">الأخبار المولّدة آلياً من first1saudi.net، مرتّبة بتاريخ كل يوم.</p>
        </div>
        <button
          onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }}
          className="shrink-0 bg-green text-white text-sm font-bold rounded-xl px-4 py-2 hover:opacity-90 transition"
        >
          تحديث
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {dates.length === 0 && !error && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4 opacity-20">🗓️</div>
          <p className="text-muted">لا توجد أخبار مولّدة بعد — ستظهر هنا تلقائياً كل يوم.</p>
        </div>
      )}

      {dates.map(date => {
        const dayItems = byDate.get(date)!
        return (
          <div key={date} className="space-y-3">
            <div className="flex items-center gap-3 sticky top-0 bg-cream/95 backdrop-blur-sm py-2 z-10">
              <h2 className="font-black text-dark">{formatArabicDate(date)}</h2>
              <span className="text-xs bg-green/10 text-green font-bold rounded-full px-2.5 py-0.5">
                {dayItems.length} منشورات
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dayItems.map(item => (
                <div key={item.id} className="bg-card rounded-2xl border border-border overflow-hidden flex flex-col">
                  {item.design_image_url ? (
                    <a href={item.design_image_url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.design_image_url} alt={item.post_title} className="w-full aspect-[4/5] object-cover bg-cream" />
                    </a>
                  ) : (
                    <div className="w-full aspect-[4/5] bg-cream flex items-center justify-center text-muted text-sm">لا يوجد تصميم</div>
                  )}

                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${item.source === 'manhom' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                        {item.source === 'manhom' ? 'السعوديات الأوائل' : 'first1saudi'}
                      </span>
                      {item.category && (
                        <span className="text-xs bg-gold/15 text-dark font-bold rounded-full px-2.5 py-0.5">{item.category}</span>
                      )}
                      {item.email_sent && (
                        <span className="text-xs bg-green/10 text-green font-medium rounded-full px-2 py-0.5">✓ أُرسل بالإيميل</span>
                      )}
                    </div>

                    {item.post_url ? (
                      <a href={item.post_url} target="_blank" rel="noreferrer" className="font-bold text-dark text-sm leading-snug hover:text-green transition">
                        {item.post_title}
                      </a>
                    ) : (
                      <span className="font-bold text-dark text-sm leading-snug">{item.post_title}</span>
                    )}

                    {item.tweets && (
                      <div className="bg-cream rounded-xl p-3 mt-auto">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-green">التغريدات المقترحة</span>
                          <button onClick={() => copyTweets(item)} className="text-xs text-green font-bold hover:underline">
                            {copiedId === item.id ? '✓ نُسخت' : 'نسخ'}
                          </button>
                        </div>
                        <p className="text-xs text-dark/80 whitespace-pre-wrap leading-relaxed line-clamp-[12]">{item.tweets}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted pt-1">
                      {item.post_url && (
                        <a href={item.post_url} target="_blank" rel="noreferrer" className="hover:text-green">🔗 الخبر الأصلي</a>
                      )}
                      {item.design_image_url && (
                        <a href={item.design_image_url} target="_blank" rel="noreferrer" className="hover:text-green">🖼️ التصميم</a>
                      )}
                    </div>

                    {/* إعادة التوليد */}
                    {openId === item.id ? (
                      <div className="mt-2 space-y-2 bg-cream rounded-xl p-3">
                        <textarea
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          placeholder="ملاحظة أو توجيه للتصميم (اختياري) — مثل: كبّر الصورة، غيّر الخلفية، أبرز جائزة معينة..."
                          rows={3}
                          disabled={busyId === item.id}
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card text-dark resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => regenerate(item)}
                            disabled={busyId === item.id}
                            className="bg-green text-white text-sm font-bold rounded-lg px-4 py-2 hover:opacity-90 transition disabled:opacity-60"
                          >
                            {busyId === item.id ? '⏳ جارٍ التوليد… (قد يستغرق دقيقتين)' : '✨ توليد'}
                          </button>
                          {busyId !== item.id && (
                            <button
                              onClick={() => { setOpenId(null); setNote('') }}
                              className="text-sm text-muted hover:text-dark px-3 py-2"
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setOpenId(item.id); setNote('') }}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-green border border-green/30 rounded-lg px-3 py-1.5 hover:bg-green/5 transition self-start"
                      >
                        🔄 إعادة توليد التصميم
                      </button>
                    )}

                    {/* جدولة النشر بتوقيت السعودية لكل القنوات */}
                    {schedId === item.id ? (
                      <div className="mt-1 space-y-2 bg-cream rounded-xl p-3">
                        <label className="block text-xs font-bold text-dark">موعد النشر (توقيت السعودية)</label>
                        <input
                          type="datetime-local"
                          value={schedWhen}
                          onChange={e => setSchedWhen(e.target.value)}
                          disabled={schedBusy}
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card text-dark"
                        />
                        <label className="block text-xs font-bold text-dark">النص المعتمد</label>
                        <textarea
                          value={schedText}
                          onChange={e => setSchedText(e.target.value)}
                          rows={4}
                          disabled={schedBusy}
                          placeholder="نص المنشور..."
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card text-dark resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => submitSchedule(item)}
                            disabled={schedBusy}
                            className="bg-green text-white text-sm font-bold rounded-lg px-4 py-2 hover:opacity-90 transition disabled:opacity-60"
                          >
                            {schedBusy ? '⏳ جارٍ الجدولة…' : '🗓️ جدولة النشر'}
                          </button>
                          {!schedBusy && (
                            <button onClick={() => setSchedId(null)} className="text-sm text-muted hover:text-dark px-3 py-2">إلغاء</button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setSchedId(item.id); setSchedWhen(''); setSchedText(item.tweets ?? '') }}
                        disabled={!item.design_image_url}
                        className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-dark border border-border rounded-lg px-3 py-1.5 hover:bg-cream transition self-start disabled:opacity-50"
                      >
                        🗓️ جدولة النشر عبر القنوات
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
