'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { formatInsoDate, INSO_MANDATORY_FOOTER, type InsoCoverageItem, type InsoPhase } from '@/lib/inso-2026'

const PHASES: Array<{ id: InsoPhase; label: string; color: string }> = [
  { id: 'before', label: 'قبل الفعالية', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'during', label: 'أثناء الفعالية', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'after', label: 'بعد الفعالية', color: 'bg-violet-50 text-violet-700 border-violet-200' },
]

const STATUS: Record<InsoCoverageItem['publication_status'], { label: string; className: string }> = {
  draft: { label: 'مسودة', className: 'bg-gray-100 text-gray-600' },
  ready: { label: 'جاهز', className: 'bg-amber-50 text-amber-700' },
  scheduled: { label: 'مجدول', className: 'bg-blue-50 text-blue-700' },
  published: { label: 'منشور', className: 'bg-green-50 text-green-700' },
}

export default function InsoCoveragePage() {
  const { showToast } = useToast()
  const [items, setItems] = useState<InsoCoverageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDate, setActiveDate] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [designNote, setDesignNote] = useState('')
  const [scheduleItem, setScheduleItem] = useState<InsoCoverageItem | null>(null)
  const [scheduleWhen, setScheduleWhen] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBrief, setNewBrief] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/inso')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تحميل الخطة')
      const incoming = data.items ?? []
      setItems(incoming)
      setActiveDate(current => current || incoming[0]?.coverage_date || '')
      setSelectedId(current => current || incoming[0]?.id || '')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تحميل الخطة', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const days = useMemo(() => [...new Set(items.map(item => item.coverage_date))], [items])
  const activeItems = items.filter(item => item.coverage_date === activeDate)
  const selected = items.find(item => item.id === selectedId) ?? activeItems[0] ?? null
  const phaseForDate = activeItems[0]?.phase ?? 'during'

  const replace = (item: InsoCoverageItem) => {
    setItems(current => current.map(entry => entry.id === item.id ? item : entry))
    setSelectedId(item.id)
  }

  const callAction = async (action: string, payload: Record<string, unknown>, label: string) => {
    setBusy(`${action}:${String(payload.id ?? '')}`)
    try {
      const response = await fetch('/api/admin/inso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تنفيذ الإجراء')
      if (data.item) replace(data.item)
      showToast(label, 'success')
      return data
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء', 'error')
      return null
    } finally {
      setBusy(null)
    }
  }

  const addPost = async () => {
    if (!newTitle.trim() || !newBrief.trim() || !activeDate) {
      showToast('أكمل عنوان المنشور ووصفه', 'error')
      return
    }
    const data = await callAction('add', {
      coverageDate: activeDate, phase: phaseForDate, title: newTitle, brief: newBrief,
    }, 'تمت إضافة محطة جديدة لليوم')
    if (data?.item) {
      setItems(current => [...current, data.item])
      setNewTitle(''); setNewBrief(''); setAdding(false)
    }
  }

  const publishNow = async (item: InsoCoverageItem) => {
    if (!item.post_text) { showToast('ولّد أو اكتب نص المنشور أولاً', 'error'); return }
    setBusy(`publish:${item.id}`)
    try {
      const response = await fetch('/api/postpulse/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: item.post_text, imageUrl: item.design_url || undefined }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'فشل النشر')
      await callAction('mark-published', { id: item.id }, 'تم النشر عبر القنوات المتصلة')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'فشل النشر', 'error')
    } finally {
      setBusy(null)
    }
  }

  const schedule = async () => {
    if (!scheduleItem || !scheduleWhen) { showToast('حدّد تاريخ ووقت الجدولة', 'error'); return }
    if (!scheduleItem.post_text) { showToast('ولّد أو اكتب نص المنشور أولاً', 'error'); return }
    setBusy(`schedule:${scheduleItem.id}`)
    try {
      const response = await fetch('/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: scheduleItem.post_text, imageUrl: scheduleItem.design_url || undefined, scheduledLocal: scheduleWhen }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'فشلت الجدولة')
      await callAction('mark-scheduled', { id: scheduleItem.id, scheduledFor: data.scheduledTime }, 'تمت الجدولة عبر القنوات المتصلة')
      setScheduleItem(null); setScheduleWhen('')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'فشلت الجدولة', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" dir="rtl">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-bold text-teal-700">غرفة عمليات التغطية</p>
            <h1 className="text-2xl font-black text-dark md:text-3xl">أولمبياد العلوم النووية الدولي 2026</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">منشورات وتصاميم وجدولة مباشرة، مرتبة حسب أيام الفعالية في جدة.</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-left text-xs font-bold text-teal-800" dir="ltr">
            <div>First1Saudi × mawhiba</div>
            <div className="mt-1 text-teal-700">{INSO_MANDATORY_FOOTER}</div>
          </div>
        </div>
      </header>

      <section id="timeline" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-black text-dark">1. خطة الأيام</h2><p className="text-xs text-muted">اختر يوماً للانتقال إلى محطات التغطية الخاصة به.</p></div>
          <button onClick={() => { setLoading(true); load() }} className="h-9 w-9 rounded-lg border border-border text-dark hover:bg-cream" title="تحديث الخطة" aria-label="تحديث الخطة">↻</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map(date => {
            const dayItems = items.filter(item => item.coverage_date === date)
            const phase = PHASES.find(entry => entry.id === dayItems[0]?.phase)
            const active = date === activeDate
            return <button key={date} onClick={() => { setActiveDate(date); setSelectedId(dayItems[0]?.id ?? '') }} className={`min-w-36 rounded-lg border p-3 text-right transition ${active ? 'border-teal-600 bg-teal-700 text-white shadow-sm' : 'border-border bg-card text-dark hover:bg-cream'}`}>
              <span className="block text-xs font-bold opacity-80">{phase?.label}</span>
              <span className="mt-1 block text-sm font-black">{formatInsoDate(date)}</span>
              <span className="mt-1 block text-xs opacity-80">{dayItems.length} محطات</span>
            </button>
          })}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section id="posts" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-black text-dark">2. منشورات {activeDate ? formatInsoDate(activeDate) : ''}</h2><p className="text-xs text-muted">كل نص يتضمن تلقائياً موهبة ووزارة التعليم والمنشنات المطلوبة.</p></div>
            <Button size="sm" variant="outline" onClick={() => setAdding(current => !current)}>＋ منشور إضافي</Button>
          </div>

          {adding && <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="عنوان المحطة أو المنشور" className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm" />
            <textarea value={newBrief} onChange={e => setNewBrief(e.target.value)} placeholder="ما الذي تريد تغطيته؟" className="min-h-20 w-full resize-y rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm" />
            <div className="flex gap-2"><Button size="sm" onClick={addPost} loading={busy?.startsWith('add:')}>إضافة</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>إلغاء</Button></div>
          </div>}

          <div className="space-y-3">
            {activeItems.map(item => {
              const status = STATUS[item.publication_status]
              const isSelected = item.id === selected?.id
              return <article key={item.id} className={`border p-4 transition ${isSelected ? 'border-teal-500 bg-teal-50/40' : 'border-border bg-card'} rounded-lg`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button onClick={() => setSelectedId(item.id)} className="min-w-0 text-right"><h3 className="font-black text-dark">{item.title}</h3><p className="mt-1 text-xs text-muted">{item.brief}</p></button>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
                </div>
                <textarea value={item.post_text ?? ''} onChange={e => replace({ ...item, post_text: e.target.value })} onFocus={() => setSelectedId(item.id)} placeholder="اضغط توليد المنشور أو اكتب الصياغة هنا..." className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm leading-6 text-dark" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => callAction('generate-copy', { id: item.id, designNote }, 'تم توليد منشور جديد')} loading={busy === `generate-copy:${item.id}`}>✨ توليد / إعادة توليد</Button>
                  <Button size="sm" variant="outline" onClick={() => callAction('save', { id: item.id, postText: item.post_text }, 'تم حفظ النص')}>حفظ النص</Button>
                  {item.design_url && <button onClick={() => setSelectedId(item.id)} className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-50">🖼️ التصميم جاهز</button>}
                </div>
              </article>
            })}
          </div>
        </section>

        <aside id="designs" className="sticky top-5 space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div><h2 className="font-black text-dark">3. التصميم والنشر</h2><p className="mt-1 text-xs text-muted">تصميم واحد لكل منشور، ثم نشر فوري أو جدولة في القنوات المتصلة.</p></div>
          {!selected ? <p className="py-8 text-center text-sm text-muted">اختر منشوراً من خطة اليوم.</p> : <>
            <div className="rounded-lg bg-cream p-3"><p className="text-xs text-muted">المنشور المحدد</p><p className="mt-1 text-sm font-black text-dark">{selected.title}</p></div>
            <textarea value={designNote} onChange={e => setDesignNote(e.target.value)} placeholder="توجيه للتصميم، مثل: لقطة علمية، ألوان أهدأ، مساحة لصورة المتحدث..." className="min-h-24 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm" />
            <Button className="w-full" onClick={() => callAction('generate-design', { id: selected.id, postText: selected.post_text, designNote }, selected.design_url ? 'تمت إعادة توليد التصميم' : 'تم توليد التصميم')} loading={busy === `generate-design:${selected.id}`}>🎨 {selected.design_url ? 'إعادة توليد التصميم' : 'توليد التصميم'}</Button>
            {selected.design_url ? <a href={selected.design_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.design_url} alt={selected.title} className="aspect-[4/5] w-full object-cover" />
            </a> : <div className="flex aspect-[4/5] items-center justify-center rounded-lg border border-dashed border-border bg-cream p-4 text-center text-xs text-muted">سيظهر هنا التصميم مع شعاري أول سعودي وموهبة.</div>}
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
              <Button size="sm" onClick={() => publishNow(selected)} loading={busy === `publish:${selected.id}`} disabled={!selected.post_text}>نشر الآن</Button>
              <Button size="sm" variant="outline" onClick={() => { setScheduleItem(selected); setScheduleWhen('') }} disabled={!selected.post_text}>جدولة</Button>
            </div>
          </>}
        </aside>
      </div>

      {scheduleItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"><h3 className="font-black text-dark">جدولة «{scheduleItem.title}»</h3><p className="mt-1 text-xs text-muted">الوقت بتوقيت السعودية.</p>
          <input type="datetime-local" value={scheduleWhen} onChange={e => setScheduleWhen(e.target.value)} className="mt-4 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          <div className="mt-4 flex gap-2"><Button className="flex-1" onClick={schedule} loading={busy === `schedule:${scheduleItem.id}`}>تأكيد الجدولة</Button><Button className="flex-1" variant="outline" onClick={() => setScheduleItem(null)}>إلغاء</Button></div>
        </div>
      </div>}
    </div>
  )
}
