'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ScheduleSuggestions from '@/components/admin/ScheduleSuggestions'

interface SchedItem {
  id: string
  content: string | null
  designUrl: string | null
  channels: number
  status: string
  when: string // ISO UTC
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const AR_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const STATUS: Record<string, { t: string; c: string }> = {
  scheduled: { t: 'مجدول', c: 'bg-blue-100 text-blue-700' },
  published: { t: 'منشور', c: 'bg-green-100 text-green-700' },
  completed: { t: 'منشور', c: 'bg-green-100 text-green-700' },
  failed: { t: 'فشل', c: 'bg-red-100 text-red-700' },
}

// تحويل ISO UTC إلى حقول جدار ساعة السعودية (UTC+3)
function ksa(iso: string) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000)
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(),
    hh: String(d.getUTCHours()).padStart(2, '0'), mm: String(d.getUTCMinutes()).padStart(2, '0'),
    key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
  }
}

export default function ScheduleCalendarPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SchedItem[]>([])
  const [view, setView] = useState<'month' | 'week'>('month')
  // مؤشر الشهر/الأسبوع المعروض (بتوقيت السعودية)
  const nowKsa = new Date(Date.now() + 3 * 3600 * 1000)
  const [cy, setCy] = useState(nowKsa.getUTCFullYear())
  const [cm, setCm] = useState(nowKsa.getUTCMonth())
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const t = new Date(Date.UTC(nowKsa.getUTCFullYear(), nowKsa.getUTCMonth(), nowKsa.getUTCDate()))
    t.setUTCDate(t.getUTCDate() - t.getUTCDay()) // الأحد
    return t
  })

  // جدولة منشور مباشرة من التقويم
  const [compose, setCompose] = useState(false)
  const [cText, setCText] = useState('')
  const [cImage, setCImage] = useState('')
  const [cWhen, setCWhen] = useState('')
  const [cUploading, setCUploading] = useState(false)
  const [cBusy, setCBusy] = useState(false)

  const loadItems = async () => {
    const res = await fetch('/api/admin/schedule')
    if (res.ok) { const d = await res.json(); setItems(d.items ?? []) }
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      await loadItems()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router])

  // فتح نافذة الجدولة مع تعبئة تاريخ اليوم المختار (اختياري)
  const openCompose = (prefillKey?: string) => {
    setCText(''); setCImage('')
    setCWhen(prefillKey ? `${prefillKey}T10:00` : '')
    setCompose(true)
  }

  const uploadComposeImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) { alert('صيغة غير مدعومة (PNG/JPG/WEBP)'); return }
    if (file.size > 10 * 1024 * 1024) { alert('الحجم يتجاوز 10 ميجابايت'); return }
    setCUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `sched-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('content-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      setCImage(data.publicUrl)
    } catch { alert('فشل رفع الصورة') } finally { setCUploading(false) }
  }

  const submitCompose = async () => {
    if (!cText.trim() && !cImage) { alert('أضِف نصاً أو صورة'); return }
    if (!cWhen) { alert('حدّد التاريخ والوقت'); return }
    setCBusy(true)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cText, imageUrl: cImage || undefined, scheduledLocal: cWhen }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error ?? 'فشل الجدولة'); return }
      const n = Array.isArray(d.accountIds) ? d.accountIds.length : 0
      alert(`تمت الجدولة في ${n} قناة بتوقيت السعودية 🗓️`)
      setCompose(false); setCText(''); setCImage(''); setCWhen('')
      await loadItems()
    } catch { alert('حدث خطأ أثناء الجدولة') } finally { setCBusy(false) }
  }

  // فهرسة العناصر حسب يوم السعودية
  const byDay = useMemo(() => {
    const map = new Map<string, SchedItem[]>()
    for (const it of items) {
      const k = ksa(it.when).key
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.when.localeCompare(b.when))
    return map
  }, [items])

  if (loading) return <div className="p-6 flex justify-center"><LoadingSpinner /></div>

  const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const todayKey = ksa(new Date().toISOString()).key

  const PostChip = ({ it }: { it: SchedItem }) => {
    const t = ksa(it.when)
    const st = STATUS[it.status] ?? { t: it.status, c: 'bg-gray-100 text-gray-600' }
    return (
      <div className="relative group/chip">
        <div className="flex items-center gap-1.5 rounded-md bg-cream px-1.5 py-1 text-[10px] cursor-default">
          {it.designUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.designUrl} alt="" className="w-5 h-6 object-cover rounded" />
            : null}
          <span className="font-bold text-dark">{t.hh}:{t.mm}</span>
          <span className={`px-1 rounded ${st.c}`}>{st.t}</span>
          <span className="text-dark/70 truncate flex-1">{(it.content ?? '').slice(0, 24)}</span>
        </div>
        {/* معاينة عند المرور: التصميم + الوقت + التغريدة */}
        <div className="hidden group-hover/chip:block absolute z-50 top-full right-0 mt-1 w-64 rounded-xl border border-border bg-white shadow-xl p-2 text-right" dir="rtl">
          {it.designUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.designUrl} alt="التصميم" className="w-full rounded-lg border border-border mb-2 max-h-72 object-contain bg-cream" />
          ) : (
            <div className="w-full h-24 rounded-lg bg-cream flex items-center justify-center text-[11px] text-muted mb-2">لا توجد معاينة للتصميم</div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-dark">🕐 {t.hh}:{t.mm}</span>
            <span className={`text-[10px] px-1.5 rounded ${st.c}`}>{st.t}</span>
            {it.channels > 0 && <span className="text-[10px] text-muted">· {it.channels} قناة</span>}
          </div>
          <p className="text-[11px] text-dark/80 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
            {it.content || '—'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-dark">🗓️ تقويم الجدولة</h1>
          <p className="text-sm text-muted mt-0.5">المنشورات المجدولة والمنشورة عبر القنوات (بتوقيت السعودية).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openCompose()} className="bg-green text-white text-sm font-bold rounded-xl px-4 py-2 hover:opacity-90 transition">
            ➕ جدولة منشور
          </button>
          <Link href="/admin/social" className="text-sm text-green hover:underline">← خطة النشر</Link>
          <div className="flex rounded-xl border border-border overflow-hidden">
            <button onClick={() => setView('month')} className={`px-3 py-1.5 text-sm font-bold ${view === 'month' ? 'bg-green text-white' : 'bg-card text-dark'}`}>شهري</button>
            <button onClick={() => setView('week')} className={`px-3 py-1.5 text-sm font-bold ${view === 'week' ? 'bg-green text-white' : 'bg-card text-dark'}`}>أسبوعي</button>
          </div>
        </div>
      </div>

      {view === 'month' ? (
        <MonthView cy={cy} cm={cm} byDay={byDay} keyOf={keyOf} todayKey={todayKey} PostChip={PostChip}
          onPrev={() => { const m = cm - 1; if (m < 0) { setCm(11); setCy(cy - 1) } else setCm(m) }}
          onNext={() => { const m = cm + 1; if (m > 11) { setCm(0); setCy(cy + 1) } else setCm(m) }} />
      ) : (
        <WeekView weekStart={weekStart} byDay={byDay} keyOf={keyOf} todayKey={todayKey} PostChip={PostChip}
          onPrev={() => { const t = new Date(weekStart); t.setUTCDate(t.getUTCDate() - 7); setWeekStart(t) }}
          onNext={() => { const t = new Date(weekStart); t.setUTCDate(t.getUTCDate() + 7); setWeekStart(t) }} />
      )}

      {/* نافذة جدولة منشور مباشرة (صورة + نص + موعد بتوقيت السعودية) */}
      {compose && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => cBusy ? null : setCompose(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-black text-dark text-base">🗓️ جدولة منشور جديد</h3>
              <p className="text-xs text-muted mt-0.5">يُنشر النص والصورة في كل القنوات المربوطة في الموعد المحدّد (توقيت السعودية).</p>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-3">
              <div>
                <label className="block text-xs font-bold text-dark mb-1">الموعد (توقيت السعودية):</label>
                <input type="datetime-local" value={cWhen} onChange={e => setCWhen(e.target.value)} disabled={cBusy}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm mb-2" />
                <ScheduleSuggestions value={cWhen} onPick={setCWhen} />
              </div>
              <div>
                <label className="block text-xs font-bold text-dark mb-1">نص المنشور:</label>
                <textarea value={cText} onChange={e => setCText(e.target.value)} disabled={cBusy}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[120px] resize-y" placeholder="اكتب نص المنشور..." />
                <p className="text-[11px] text-muted mt-1">{cText.length} حرف</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-dark mb-1">الصورة (اختياري):</label>
                {cImage ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cImage} alt="" className="w-16 h-20 object-cover rounded-lg border border-border" />
                    <button onClick={() => setCImage('')} disabled={cBusy} className="text-xs text-red-600 hover:underline">إزالة الصورة</button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-dark border border-dashed border-border rounded-lg px-3 py-2 cursor-pointer hover:border-green hover:text-green transition">
                    <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={uploadComposeImage} disabled={cUploading || cBusy} className="hidden" />
                    {cUploading ? 'جارٍ الرفع…' : '⬆️ رفع صورة'}
                  </label>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2">
              <button onClick={submitCompose} disabled={cBusy || cUploading || !cWhen || (!cText.trim() && !cImage)}
                className="flex-1 bg-green text-white text-sm font-bold rounded-xl px-4 py-2 hover:opacity-90 transition disabled:opacity-60">
                {cBusy ? '⏳ جارٍ الجدولة…' : '🗓️ جدولة المنشور'}
              </button>
              <button onClick={() => setCompose(false)} disabled={cBusy} className="text-sm text-muted hover:text-dark px-3 py-2">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthView({ cy, cm, byDay, keyOf, todayKey, PostChip, onPrev, onNext }: {
  cy: number; cm: number; byDay: Map<string, SchedItem[]>; keyOf: (y: number, m: number, d: number) => string
  todayKey: string; PostChip: React.FC<{ it: SchedItem }>; onPrev: () => void; onNext: () => void
}) {
  const firstWd = new Date(Date.UTC(cy, cm, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(cy, cm + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-card rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onNext} className="px-3 py-1 rounded-lg hover:bg-cream">→</button>
        <h2 className="font-black text-dark">{AR_MONTHS[cm]} {cy}</h2>
        <button onClick={onPrev} className="px-3 py-1 rounded-lg hover:bg-cream">←</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted mb-1">
        {AR_DAYS.map(d => <div key={d} className="py-1 font-bold">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="min-h-[90px] rounded-lg bg-cream/40" />
          const k = keyOf(cy, cm, d)
          const posts = byDay.get(k) ?? []
          return (
            <div key={i} className={`min-h-[90px] rounded-lg border p-1 ${k === todayKey ? 'border-green bg-green/5' : 'border-border'}`}>
              <div className="text-[11px] font-bold text-dark/70 mb-1">{d}</div>
              <div className="space-y-1">
                {posts.slice(0, 3).map(it => <PostChip key={it.id} it={it} />)}
                {posts.length > 3 && <div className="text-[10px] text-muted">+{posts.length - 3} أخرى</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ weekStart, byDay, keyOf, todayKey, PostChip, onPrev, onNext }: {
  weekStart: Date; byDay: Map<string, SchedItem[]>; keyOf: (y: number, m: number, d: number) => string
  todayKey: string; PostChip: React.FC<{ it: SchedItem }>; onPrev: () => void; onNext: () => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const t = new Date(weekStart); t.setUTCDate(weekStart.getUTCDate() + i); return t
  })
  const end = new Date(weekStart); end.setUTCDate(weekStart.getUTCDate() + 6)
  return (
    <div className="bg-card rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onNext} className="px-3 py-1 rounded-lg hover:bg-cream">→</button>
        <h2 className="font-black text-dark text-sm">
          {weekStart.getUTCDate()} {AR_MONTHS[weekStart.getUTCMonth()]} – {end.getUTCDate()} {AR_MONTHS[end.getUTCMonth()]} {end.getUTCFullYear()}
        </h2>
        <button onClick={onPrev} className="px-3 py-1 rounded-lg hover:bg-cream">←</button>
      </div>
      <div className="space-y-2">
        {days.map((t, i) => {
          const k = keyOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
          const posts = byDay.get(k) ?? []
          return (
            <div key={i} className={`rounded-xl border p-2 ${k === todayKey ? 'border-green bg-green/5' : 'border-border'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-dark text-sm">{AR_DAYS[t.getUTCDay()]} {t.getUTCDate()}</span>
                <span className="text-xs text-muted">{posts.length ? `${posts.length} منشور` : '—'}</span>
              </div>
              {posts.length > 0 && <div className="space-y-1">{posts.map(it => <PostChip key={it.id} it={it} />)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
