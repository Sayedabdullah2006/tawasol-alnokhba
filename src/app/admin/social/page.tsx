'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ScheduleSuggestions from '@/components/admin/ScheduleSuggestions'

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

type ScheduleFilter = 'all' | 'scheduled' | 'unscheduled'
type SocialTab = 'daily' | 'occasions'

interface OccasionMeta {
  id: string
  date: string | null
  dateLabel: string
  kind: 'official' | 'global' | 'religious'
  category: string
}

interface OccasionItem {
  id: string
  post_url: string
  post_title: string
  category: string | null
  design_image_url: string | null
  tweets: string | null
  batch_date: string
  status: string
}

function formatArabicDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ar', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory',
  })
}

function getScheduleStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'scheduled':
      return { label: 'مجدول للنشر', className: 'bg-blue-50 text-blue-700 border border-blue-100' }
    default:
      return { label: '', className: '' }
  }
}

function ScheduleStatusBadge({ status, onCancel }: { status: string; onCancel?: () => void }) {
  const badge = getScheduleStatusBadge(status)
  if (!badge.label) return null

  if (onCancel) {
    return (
      <button type="button" onClick={onCancel} title="إلغاء الجدولة" className={`text-xs font-bold rounded-full px-2.5 py-0.5 transition hover:ring-2 hover:ring-blue-200 ${badge.className}`}>
        {badge.label}
      </button>
    )
  }

  return (
    <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${badge.className}`}>
      {badge.label}
    </span>
  )
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
  // استبدال صورة المصدر عند إعادة التوليد
  const [newImage, setNewImage] = useState('')
  const [imgUploading, setImgUploading] = useState(false)

  const uploadNewImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) { alert('صيغة غير مدعومة (PNG/JPG/WEBP)'); return }
    if (file.size > 10 * 1024 * 1024) { alert('الحجم يتجاوز 10 ميجابايت'); return }
    setImgUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `social-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('content-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      setNewImage(data.publicUrl)
    } catch { alert('فشل رفع الصورة') } finally { setImgUploading(false) }
  }
  // جدولة النشر
  const [schedId, setSchedId] = useState<string | null>(null)
  const [schedWhen, setSchedWhen] = useState('')
  const [schedText, setSchedText] = useState('')
  const [schedBusy, setSchedBusy] = useState(false)
  // توليد يدوي لمنشورات إضافية لنفس اليوم
  const [genBusy, setGenBusy] = useState(false)
  const [genCount, setGenCount] = useState(3)
  const [educationBusy, setEducationBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [educationPreview, setEducationPreview] = useState<{ title: string; caption: string; designUrl: string } | null>(null)
  const [cancelScheduleItem, setCancelScheduleItem] = useState<ScheduleItem | null>(null)
  const [cancelScheduleBusy, setCancelScheduleBusy] = useState(false)
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all')
  const [activeTab, setActiveTab] = useState<SocialTab>('daily')
  const [occasions, setOccasions] = useState<OccasionMeta[]>([])
  const [occasionItems, setOccasionItems] = useState<OccasionItem[]>([])
  const [occasionsLoading, setOccasionsLoading] = useState(false)
  const [occasionBusy, setOccasionBusy] = useState<string | null>(null)
  const [generatingAllOccasions, setGeneratingAllOccasions] = useState(false)
  const [occasionText, setOccasionText] = useState<Record<string, string>>({})

  const loadOccasions = async () => {
    const res = await fetch('/api/admin/social/occasions', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'تعذر تحميل مناسبات أول سعودي')
    setOccasions(Array.isArray(json.occasions) ? json.occasions : [])
    setOccasionItems(Array.isArray(json.items) ? json.items : [])
  }

  const requestOccasionGeneration = async (occasionId: string) => {
    const res = await fetch('/api/admin/social/occasions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate', occasionId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'تعذر توليد المناسبة')
  }

  const generateOccasion = async (occasionId: string) => {
    setOccasionBusy(occasionId)
    try {
      await requestOccasionGeneration(occasionId)
      await loadOccasions()
      alert('تمت إعادة توليد المنشور والتصميم')
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : 'تعذر التوليد')
    } finally {
      setOccasionBusy(null)
    }
  }

  const generateAllOccasions = async () => {
    setGeneratingAllOccasions(true)
    let completed = 0
    let failed = 0
    for (const occasion of occasions) {
      const occasionId = `${occasion.id}-${occasion.date ?? 'hijri'}`
      setOccasionBusy(occasionId)
      try {
        await requestOccasionGeneration(occasionId)
        completed += 1
        await loadOccasions()
      } catch {
        failed += 1
      } finally {
        setOccasionBusy(null)
      }
    }
    setGeneratingAllOccasions(false)
    alert(failed ? `تم توليد ${completed} مناسبة، وتعذر توليد ${failed}` : `تم توليد ${completed} مناسبة وحفظها`)
  }

  const scheduleOccasion = async (item: OccasionItem) => {
    setOccasionBusy(`schedule:${item.id}`)
    try {
      const res = await fetch('/api/admin/social/occasions/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, content: occasionText[item.id] ?? item.tweets ?? '' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'تعذرت الجدولة')
      await loadOccasions()
      const time = new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(json.scheduledFor))
      alert(`تمت الجدولة في ${time} بتوقيت السعودية`)
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : 'تعذرت الجدولة')
    } finally {
      setOccasionBusy(null)
    }
  }

  const generateEducation = async () => {
    setEducationBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/social/education', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) throw new Error(json.error || 'فشل توليد المحتوى التثقيفي')
      await Promise.all([load(), loadOccasions()])
      alert(json.created ? 'تم توليد 3 منشورات تثقيفية وجدولتها في المواعيد الشاغرة' : 'دفعة المحتوى التثقيفي الحالية موجودة بالفعل')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'فشل توليد المحتوى التثقيفي')
    } finally {
      setEducationBusy(false)
    }
  }

  const previewEducation = async () => {
    setPreviewBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/social/education/preview', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) throw new Error(json.error || 'تعذّرت المعاينة')
      setEducationPreview({ title: json.title, caption: json.caption, designUrl: json.designUrl })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'تعذّرت المعاينة')
    } finally {
      setPreviewBusy(false)
    }
  }

  const cancelSchedule = async () => {
    if (!cancelScheduleItem) return
    setCancelScheduleBusy(true)
    try {
      const res = await fetch('/api/admin/social-schedule/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cancelScheduleItem.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'تعذّر إلغاء الجدولة')
      if (cancelScheduleItem.source === 'first1saudi-occasion') {
        setOccasionItems(current => current.map(item => item.id === cancelScheduleItem.id ? { ...item, status: 'suggested' } : item))
      } else {
        setItems(current => current.map(item => item.id === cancelScheduleItem.id ? { ...item, status: 'suggested' } : item))
      }
      setCancelScheduleItem(null)
      alert('تم إلغاء الجدولة من PostPulse')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'تعذّر إلغاء الجدولة')
    } finally {
      setCancelScheduleBusy(false)
    }
  }

  const generateMore = async () => {
    setGenBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: genCount }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) throw new Error(json.error || 'فشل التوليد')
      await load()
      alert(`تم توليد ${json.generated ?? 0} منشورات إضافية لليوم ✅`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'فشل التوليد')
    } finally {
      setGenBusy(false)
    }
  }

  const submitSchedule = async (item: ScheduleItem) => {
    if (!schedWhen) { alert('حدّد تاريخ ووقت الجدولة'); return }
    setSchedBusy(true)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: schedText, imageUrl: item.design_image_url, scheduledLocal: schedWhen, socialScheduleId: item.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'فشل الجدولة')
      const n = Array.isArray(json.accountIds) ? json.accountIds.length : 0
      alert(`تمت الجدولة في ${n} قناة بتوقيت السعودية ✅`)
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, status: 'scheduled' } : it)))
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
        body: JSON.stringify({ id: item.id, note, imageUrl: newImage || undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل إعادة التوليد')
      setItems(prev => prev.map(it =>
        it.id === item.id ? { ...it, design_image_url: json.design_image_url, tweets: json.tweets } : it,
      ))
      setOpenId(null)
      setNote('')
      setNewImage('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'فشل إعادة التوليد')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />

  const dailyItems = items.filter(item => item.source !== 'first1saudi-occasion')
  const scheduledItems = dailyItems.filter(item => item.status === 'scheduled')
  const unscheduledItems = dailyItems.filter(item => item.status !== 'scheduled')
  const visibleItems = dailyItems.filter(item => {
    if (scheduleFilter === 'scheduled') return item.status === 'scheduled'
    if (scheduleFilter === 'unscheduled') return item.status !== 'scheduled'
    return true
  })

  // تجميع حسب اليوم
  const byDate = new Map<string, ScheduleItem[]>()
  for (const it of visibleItems) {
    if (!byDate.has(it.batch_date)) byDate.set(it.batch_date, [])
    byDate.get(it.batch_date)!.push(it)
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1))
  const filterOptions: Array<{ value: ScheduleFilter; label: string; count: number }> = [
    { value: 'all', label: 'الكل', count: dailyItems.length },
    { value: 'scheduled', label: 'المجدولة', count: scheduledItems.length },
    { value: 'unscheduled', label: 'غير المجدولة', count: unscheduledItems.length },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-dark">🗓️ خطة النشر اليومية</h1>
          <p className="text-sm text-muted mt-0.5">الأخبار المولّدة آلياً من first1saudi.net، مرتّبة بتاريخ كل يوم.</p>
        </div>
        {activeTab === 'daily' && <div className="shrink-0 flex flex-wrap items-center gap-2">
          {/* توليد يدوي لمنشورات إضافية لنفس اليوم */}
          <select
            value={genCount}
            onChange={e => setGenCount(Number(e.target.value))}
            disabled={genBusy}
            aria-label="عدد المنشورات الإضافية"
            className="rounded-xl border border-border bg-white text-sm font-bold px-2 py-2 disabled:opacity-60"
          >
            {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            onClick={generateMore}
            disabled={genBusy}
            className="bg-dark text-white text-sm font-bold rounded-xl px-4 py-2 hover:opacity-90 transition disabled:opacity-60"
          >
            {genBusy ? '⏳ جارٍ التوليد…' : '➕ توليد منشورات إضافية'}
          </button>
          <button
            onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }}
            disabled={genBusy}
            className="bg-green text-white text-sm font-bold rounded-xl px-4 py-2 hover:opacity-90 transition disabled:opacity-60"
          >
            تحديث
          </button>
        </div>}
      </div>
      <div className="flex w-full gap-2 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label="أقسام خطة النشر">
        <button type="button" role="tab" aria-selected={activeTab === 'daily'} onClick={() => setActiveTab('daily')} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === 'daily' ? 'bg-dark text-white' : 'text-muted hover:bg-cream hover:text-dark'}`}>خطة النشر والمحتوى التثقيفي</button>
        <button type="button" role="tab" aria-selected={activeTab === 'occasions'} onClick={() => setActiveTab('occasions')} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === 'occasions' ? 'bg-dark text-white' : 'text-muted hover:bg-cream hover:text-dark'}`}>مناسبات أول سعودي</button>
      </div>
      {activeTab === 'daily' && <>
      {genBusy && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm flex items-center gap-2">
          <LoadingSpinner size="sm" />
          <span>جارٍ توليد {genCount} منشورات جديدة (تحليل + تصميم)… قد يستغرق دقيقتين، لا تغلق الصفحة.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-green/25 bg-green/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-dark">محتوى أول سعودي التثقيفي</h2>
          <p className="mt-1 text-sm text-muted">كل ثلاثة أيام: 3 منشورات سعودية مفيدة، مع إنفوجرافيك وجدولة تلقائية في المواعيد الشاغرة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={previewEducation}
            disabled={previewBusy || educationBusy}
            className="shrink-0 rounded-xl border border-green/35 px-4 py-2 text-sm font-bold text-green transition hover:bg-green/10 disabled:opacity-60"
          >
            {previewBusy ? 'جارٍ تجهيز المعاينة...' : 'معاينة نموذج'}
          </button>
          <button
            type="button"
            onClick={generateEducation}
            disabled={educationBusy || previewBusy}
            className="shrink-0 rounded-xl bg-green px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {educationBusy ? 'جارٍ التوليد والجدولة...' : 'توليد وجدولة دفعة تثقيفية'}
          </button>
        </div>
      </section>

      {educationPreview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-card p-4 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-black text-dark">معاينة محتوى أول سعودي</h2>
                <p className="mt-1 text-sm text-muted">لن تُحفظ هذه المعاينة ولن تُجدول أو تُنشر.</p>
              </div>
              <button type="button" onClick={() => setEducationPreview(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-dark">إغلاق</button>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="rounded-xl bg-cream p-4">
                <h3 className="font-bold text-dark">{educationPreview.title}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-dark/80">{educationPreview.caption}</p>
              </div>
              <a href={educationPreview.designUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-cream">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={educationPreview.designUrl} alt={educationPreview.title} className="h-auto w-full" />
              </a>
            </div>
          </div>
        </div>
      )}

      {cancelScheduleItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="تأكيد إلغاء الجدولة">
          <div className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-2xl sm:rounded-2xl">
            <h2 className="font-black text-dark">إلغاء الجدولة؟</h2>
            <p className="mt-2 text-sm leading-6 text-muted">لن يُنشر «{cancelScheduleItem.post_title}» في موعده المحدد، وسيبقى النص والتصميم محفوظين ضمن الخطة.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={cancelSchedule} disabled={cancelScheduleBusy} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {cancelScheduleBusy ? 'جارٍ الإلغاء...' : 'نعم، إلغاء الجدولة'}
              </button>
              <button type="button" onClick={() => setCancelScheduleItem(null)} disabled={cancelScheduleBusy} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-dark disabled:opacity-60">الاحتفاظ بالجدولة</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
        {filterOptions.map(option => {
          const active = scheduleFilter === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setScheduleFilter(option.value)}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                active
                  ? 'bg-green text-white shadow-sm'
                  : 'text-muted hover:bg-cream hover:text-dark'
              }`}
            >
              {option.label}
              <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20 text-white' : 'bg-cream text-dark'}`}>
                {option.count}
              </span>
            </button>
          )
        })}
      </div>

      {dates.length === 0 && !error && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4 opacity-20">🗓️</div>
          <p className="text-muted">
            {items.length === 0
              ? 'لا توجد أخبار مولّدة بعد — ستظهر هنا تلقائياً كل يوم.'
              : 'لا توجد منشورات مطابقة لهذا الفلتر.'}
          </p>
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
                      <ScheduleStatusBadge status={item.status} onCancel={item.status === 'scheduled' ? () => setCancelScheduleItem(item) : undefined} />
                      <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${item.source === 'manhom' ? 'bg-purple-100 text-purple-700' : item.source === 'first1saudi-educational' ? 'bg-green/10 text-green' : 'bg-teal-100 text-teal-700'}`}>
                        {item.source === 'manhom' ? 'السعوديات الأوائل' : item.source === 'first1saudi-educational' ? 'محتوى تثقيفي' : 'first1saudi'}
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
                          <span className="text-xs font-bold text-green">{item.source === 'first1saudi-educational' ? 'المنشور المعتمد' : 'التغريدات المقترحة'}</span>
                          <button onClick={() => copyTweets(item)} className="text-xs text-green font-bold hover:underline">
                            {copiedId === item.id ? '✓ نُسخت' : 'نسخ'}
                          </button>
                        </div>
                        <p className="text-xs text-dark/80 whitespace-pre-wrap leading-relaxed line-clamp-[12]">{item.tweets}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted pt-1">
                      {item.post_url && (
                        <a href={item.post_url} target="_blank" rel="noreferrer" className="hover:text-green">{item.source === 'first1saudi-educational' ? 'مرجع داخلي' : '🔗 الخبر الأصلي'}</a>
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
                        {/* استبدال صورة المصدر — يُعاد التوليد بنفس المعلومات بالصورة الجديدة */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {newImage ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={newImage} alt="صورة جديدة" className="w-12 h-12 rounded-lg object-cover border border-border" />
                              <span className="text-xs font-bold text-green-700">صورة جديدة ستُستخدم في التصميم</span>
                              <button onClick={() => setNewImage('')} disabled={busyId === item.id} className="text-xs text-red-600 hover:underline">إزالة</button>
                            </>
                          ) : (
                            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-dark border border-dashed border-border rounded-lg px-3 py-1.5 cursor-pointer hover:border-green hover:text-green transition">
                              <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={uploadNewImage} disabled={imgUploading || busyId === item.id} className="hidden" />
                              {imgUploading ? 'جارٍ الرفع…' : '🖼️ إرفاق صورة أخرى (اختياري)'}
                            </label>
                          )}
                        </div>
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
                              onClick={() => { setOpenId(null); setNote(''); setNewImage('') }}
                              className="text-sm text-muted hover:text-dark px-3 py-2"
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setOpenId(item.id); setNote(''); setNewImage('') }}
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
                        <ScheduleSuggestions value={schedWhen} onPick={setSchedWhen} />
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
      </>}

      {activeTab === 'occasions' && (
        <OccasionsTab
          occasions={occasions}
          items={occasionItems}
          loading={occasionsLoading}
          busy={occasionBusy}
          generatingAll={generatingAllOccasions}
          textByItem={occasionText}
          onTextChange={(id, value) => setOccasionText(current => ({ ...current, [id]: value }))}
          onGenerateAll={generateAllOccasions}
          onRegenerate={generateOccasion}
          onSchedule={scheduleOccasion}
          onReload={async () => {
            setOccasionsLoading(true)
            try { await loadOccasions() } catch (cause) { alert(cause instanceof Error ? cause.message : 'تعذر التحديث') } finally { setOccasionsLoading(false) }
          }}
          onCancel={setCancelScheduleItem}
        />
      )}
    </div>
  )
}

function OccasionsTab({
  occasions, items, loading, busy, generatingAll, textByItem, onTextChange, onGenerateAll, onRegenerate, onSchedule, onReload, onCancel,
}: {
  occasions: OccasionMeta[]
  items: OccasionItem[]
  loading: boolean
  busy: string | null
  generatingAll: boolean
  textByItem: Record<string, string>
  onTextChange: (id: string, value: string) => void
  onGenerateAll: () => void
  onRegenerate: (occasionId: string) => void
  onSchedule: (item: OccasionItem) => void
  onReload: () => void
  onCancel: (item: ScheduleItem) => void
}) {
  const itemFor = (occasion: OccasionMeta) => items.find(item => item.post_url === `occasion:${occasion.id}-${occasion.date ?? 'hijri'}`)
  const kindLabel = (kind: OccasionMeta['kind']) => kind === 'official' ? 'مناسبة سعودية' : kind === 'religious' ? 'عيد رسمي' : 'يوم عالمي'
  const kindClass = (kind: OccasionMeta['kind']) => kind === 'official' ? 'bg-green/10 text-green' : kind === 'religious' ? 'bg-gold/15 text-dark' : 'bg-teal-100 text-teal-700'

  return (
    <section className="space-y-4" role="tabpanel">
      <div className="flex flex-col gap-3 border-b border-green/25 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-dark">مناسبات أول سعودي</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">منشور واحد وتصميم واحد لكل مناسبة. لا تُجدول أي مناسبة تلقائياً؛ زر الجدولة يختار وقتاً مناسباً في تاريخها مع ترك 90 دقيقة عن أي منشور آخر.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onReload} disabled={loading || busy !== null || generatingAll} className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-dark disabled:opacity-60">{loading ? 'جارٍ التحديث...' : 'تحديث'}</button>
          <button type="button" onClick={onGenerateAll} disabled={busy !== null || generatingAll} className="rounded-lg bg-green px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">{generatingAll ? 'جارٍ توليد التصاميم تباعاً...' : 'توليد تصاميم كل المناسبات'}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {occasions.map(occasion => {
          const item = itemFor(occasion)
          const itemBusy = busy === occasion.id
          const scheduleBusy = item ? busy === `schedule:${item.id}` : false
          return (
            <article key={`${occasion.id}-${occasion.date}`} className="overflow-hidden rounded-xl border border-border bg-card">
              {item?.design_image_url && (
                <a href={item.design_image_url} target="_blank" rel="noreferrer" className="block bg-cream">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.design_image_url} alt={item.post_title} className="mx-auto aspect-[4/5] w-full max-w-sm object-cover" />
                </a>
              )}
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${kindClass(occasion.kind)}`}>{kindLabel(occasion.kind)}</span>
                  <span className="text-xs font-bold text-muted">{occasion.date ? formatArabicDate(occasion.date) : 'يُحدد بالتاريخ الهجري'}</span>
                  {item?.status === 'scheduled' && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">مجدول</span>}
                </div>
                <div>
                  <h3 className="font-black text-dark">{occasion.category}</h3>
                  <p className="mt-1 text-sm text-muted">{occasion.dateLabel}</p>
                </div>
                {item ? (
                  <textarea value={textByItem[item.id] ?? item.tweets ?? ''} onChange={event => onTextChange(item.id, event.target.value)} rows={6} className="w-full resize-y rounded-lg border border-border bg-cream px-3 py-2 text-sm leading-6 text-dark" aria-label={`نص ${occasion.category}`} />
                ) : (
                  <div className="rounded-lg bg-cream p-3 text-sm text-muted">لم يتم توليد المنشور والتصميم بعد.</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onRegenerate(`${occasion.id}-${occasion.date ?? 'hijri'}`)} disabled={busy !== null || generatingAll} className="rounded-lg border border-green/35 px-3 py-2 text-sm font-bold text-green disabled:opacity-60">{itemBusy ? 'جارٍ التوليد...' : item ? 'إعادة التوليد' : 'توليد المناسبة'}</button>
                  {item && item.status !== 'scheduled' && <button type="button" onClick={() => onSchedule(item)} disabled={busy !== null || generatingAll || !occasion.date} className="rounded-lg bg-dark px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{scheduleBusy ? 'جارٍ الجدولة...' : occasion.date ? 'جدولة في وقت مناسب' : 'بانتظار اعتماد التاريخ'}</button>}
                  {item?.status === 'scheduled' && <button type="button" onClick={() => onCancel(item as ScheduleItem)} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700">إلغاء الجدولة</button>}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
