'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase'
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
  const supabase = createClient()
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
  const [savedTexts, setSavedTexts] = useState<Record<string, string>>({})
  const [designItem, setDesignItem] = useState<InsoCoverageItem | null>(null)
  const [designSource, setDesignSource] = useState('')
  const [designHasVideo, setDesignHasVideo] = useState(false)
  const [designUploading, setDesignUploading] = useState(false)
  const [editOption, setEditOption] = useState<{ item: InsoCoverageItem; optionId: string } | null>(null)
  const [editNote, setEditNote] = useState('')
  const [addingSaved, setAddingSaved] = useState(false)
  const [savedTitle, setSavedTitle] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const skipNextTextSave = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/inso')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تحميل الخطة')
      const incoming = data.items ?? []
      setItems(incoming)
      setSavedTexts(Object.fromEntries(incoming.map((item: InsoCoverageItem) => [item.id, item.post_text ?? ''])))
      setActiveDate(current => current || incoming[0]?.coverage_date || '')
      setSelectedId(current => current || incoming[0]?.id || '')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تحميل الخطة', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, setSavedTexts])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const days = useMemo(() => [...new Set(items.map(item => item.coverage_date))], [items])
  const activeItems = items.filter(item => item.coverage_date === activeDate)
  const selected = items.find(item => item.id === selectedId) ?? activeItems[0] ?? null
  const phaseForDate = activeItems[0]?.phase ?? 'during'
  const savedDayItems = activeItems.filter(item => savedTexts[item.id]?.trim())
  const savedDayText = savedDayItems.map((item, index) => `${index + 1}. ${item.title}\n${savedTexts[item.id]}`).join('\n\n---\n\n')

  const replace = (item: InsoCoverageItem) => {
    setItems(current => current.map(entry => entry.id === item.id ? item : entry))
    setSelectedId(item.id)
  }

  const skipTextSaveForAction = (itemId: string) => {
    skipNextTextSave.current = itemId
    window.setTimeout(() => {
      if (skipNextTextSave.current === itemId) skipNextTextSave.current = null
    }, 0)
  }

  const callAction = async (action: string, payload: Record<string, unknown>, label: string) => {
    setBusy(`${action}:${String(payload.id ?? '')}`)
    try {
      const response = await fetch('/api/admin/inso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تنفيذ الإجراء')
      if (data.item) {
        if (action === 'add-saved') {
          setItems(current => [...current, data.item])
          setSelectedId(data.item.id)
          setSavedTexts(current => ({ ...current, [data.item.id]: data.item.post_text ?? '' }))
        } else {
          replace(data.item)
          if (action === 'save' || action === 'generate-copy') setSavedTexts(current => ({ ...current, [data.item.id]: data.item.post_text ?? '' }))
        }
      }
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

  const uploadDesignSource = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) { showToast('ارفق صورة بصيغة PNG أو JPG أو WEBP', 'error'); return }
    setDesignUploading(true)
    try {
      const extension = file.name.split('.').pop() || 'png'
      const path = `inso-source-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
      const { error } = await supabase.storage.from('content-images').upload(path, file)
      if (error) throw error
      setDesignSource(supabase.storage.from('content-images').getPublicUrl(path).data.publicUrl)
    } catch { showToast('تعذّر رفع الصورة المرجعية', 'error') } finally { setDesignUploading(false) }
  }

  const openDesigner = (item: InsoCoverageItem) => {
    setSelectedId(item.id)
    setDesignItem(item)
    setDesignSource('')
    setDesignNote('')
    setDesignHasVideo(false)
  }

  const generateDesignOptions = async () => {
    if (!designItem) return
    const result = await callAction('generate-design-options', {
      id: designItem.id, postText: designItem.post_text, designNote, sourceImage: designSource || undefined, hasVideo: designHasVideo,
    }, 'تم توليد 3 خيارات للتصميم')
    if (result?.item) setDesignItem(result.item)
  }

  const addSavedPost = async () => {
    if (!savedTitle.trim() || !savedContent.trim()) { showToast('اكتب عنوان المنشور ونصه أولا', 'error'); return }
    const result = await callAction('add-saved', {
      coverageDate: activeDate, phase: phaseForDate, title: savedTitle, postText: savedContent,
    }, 'تم حفظ المنشور داخل محتوى اليوم')
    if (result?.item) {
      setSavedTitle(''); setSavedContent(''); setAddingSaved(false)
      openDesigner(result.item)
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
          <div><h2 className="font-black text-dark">خطة النشر حسب اليوم</h2><p className="text-xs text-muted">كل تبويب يجمع منشورات اليوم وتوليد النص والتصميم والنشر والجدولة.</p></div>
          <button onClick={() => { setLoading(true); load() }} className="h-9 w-9 rounded-lg border border-border text-dark hover:bg-cream" title="تحديث الخطة" aria-label="تحديث الخطة">↻</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="أيام خطة النشر">
          {days.map(date => {
            const dayItems = items.filter(item => item.coverage_date === date)
            const phase = PHASES.find(entry => entry.id === dayItems[0]?.phase)
            const active = date === activeDate
            return <button key={date} id={`day-tab-${date}`} role="tab" aria-selected={active} aria-controls={`day-panel-${date}`} onClick={() => { setActiveDate(date); setSelectedId(dayItems[0]?.id ?? ''); setAdding(false); setDesignNote('') }} className={`min-w-36 rounded-lg border p-3 text-right transition ${active ? 'border-teal-600 bg-teal-700 text-white shadow-sm' : 'border-border bg-card text-dark hover:bg-cream'}`}>
              <span className="block text-xs font-bold opacity-80">{phase?.label}</span>
              <span className="mt-1 block text-sm font-black">{formatInsoDate(date)}</span>
              <span className="mt-1 block text-xs opacity-80">{dayItems.length} محطات</span>
            </button>
          })}
        </div>
      </section>

      <section id={`day-panel-${activeDate}`} role="tabpanel" aria-labelledby={`day-tab-${activeDate}`} className="space-y-5">
        <section id="posts" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-black text-dark">منشورات اليوم</h3><p className="text-xs text-muted">كل نص يتضمن تلقائياً موهبة ووزارة التعليم والمنشنات المطلوبة.</p></div>
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
                <textarea value={item.post_text ?? ''} onChange={e => replace({ ...item, post_text: e.target.value })} onFocus={() => setSelectedId(item.id)} onBlur={() => { if (skipNextTextSave.current === item.id) { skipNextTextSave.current = null; return }; if (item.post_text?.trim()) void callAction('save', { id: item.id, postText: item.post_text }, 'تم حفظ النص ضمن محتوى اليوم') }} placeholder="اضغط توليد المنشور أو اكتب الصياغة هنا..." className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm leading-6 text-dark" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => callAction('generate-copy', { id: item.id }, 'تم توليد المنشور وحفظه ضمن محتوى اليوم')} loading={busy === `generate-copy:${item.id}`}>✨ توليد / إعادة توليد</Button>
                  <Button size="sm" variant="outline" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => openDesigner(item)} disabled={!item.post_text}>🎨 توليد 3 تصاميم</Button>
                  <Button size="sm" variant="ghost" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => publishNow(item)} loading={busy === `publish:${item.id}`} disabled={!item.post_text}>نشر الآن</Button>
                  <Button size="sm" variant="ghost" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => { setScheduleItem(item); setScheduleWhen('') }} disabled={!item.post_text}>جدولة</Button>
                </div>
                {item.design_options?.length ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {item.design_options.map(option => <div key={option.id} className={`overflow-hidden rounded-lg border ${item.design_url === option.imageUrl ? 'border-teal-500 bg-teal-50/40' : 'border-border bg-white'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={option.imageUrl} alt={`${item.title} - ${option.title}`} className="aspect-[4/5] w-full object-cover" />
                    <div className="space-y-2 p-2"><p className="text-xs font-bold text-dark">{option.title}</p><p className="text-[11px] text-muted">{option.direction}</p>
                      <div className="flex gap-2"><Button size="sm" className="flex-1" onClick={() => callAction('select-design-option', { id: item.id, optionId: option.id }, 'تم اختيار التصميم')} variant={item.design_url === option.imageUrl ? 'secondary' : 'outline'}>اختيار</Button><Button size="sm" variant="ghost" onClick={() => { setEditOption({ item, optionId: option.id }); setEditNote('') }}>تعديل</Button></div>
                    </div>
                  </div>)}
                </div> : null}
              </article>
            })}
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-5" aria-label="المحتوى المحفوظ لليوم">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-black text-dark">المحتوى المحفوظ لليوم</h3><p className="text-xs text-muted">تظهر هنا النصوص التي تم حفظها من منشورات هذا التبويب.</p></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">{savedDayItems.length} نصوص محفوظة</span><Button size="sm" variant="outline" onClick={() => setAddingSaved(current => !current)}>＋ إضافة منشور محفوظ</Button></div>
          </div>
          {addingSaved && <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
            <input value={savedTitle} onChange={event => setSavedTitle(event.target.value)} placeholder="عنوان المنشور" className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm" />
            <textarea value={savedContent} onChange={event => setSavedContent(event.target.value)} placeholder="اكتب النص الجاهز للنشر..." className="min-h-32 w-full resize-y rounded-lg border border-teal-200 bg-white p-3 text-sm leading-6" />
            <div className="flex flex-wrap gap-2"><Button size="sm" onClick={addSavedPost} loading={busy?.startsWith('add-saved:')}>حفظ وبدء التصميم</Button><Button size="sm" variant="ghost" onClick={() => setAddingSaved(false)}>إلغاء</Button></div>
          </div>}
          {savedDayItems.length ? <textarea readOnly value={savedDayText} className="min-h-56 w-full resize-y rounded-lg border border-teal-200 bg-teal-50/40 p-4 text-sm leading-7 text-dark" /> : <div className="rounded-lg border border-dashed border-border bg-cream p-4 text-sm text-muted">تظهر هنا المنشورات فور توليدها أو عند حفظ تعديل يدوي على النص.</div>}
        </section>
      </section>

      {designItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="توليد خيارات التصميم">
        <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-xl"><div><h3 className="font-black text-dark">3 خيارات تصميم: {designItem.title}</h3><p className="mt-1 text-xs text-muted">أرفق صورة مرجعية عند الحاجة أو اختر أن المنشور مقطع فيديو.</p></div>
          <textarea value={designNote} onChange={e => setDesignNote(e.target.value)} placeholder="توجيه إضافي للتصميم (اختياري)" className="min-h-24 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm" />
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-dark">صورة مرجعية<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadDesignSource} className="mt-2 block w-full text-xs text-muted" /></label><label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-dark"><input type="checkbox" checked={designHasVideo} onChange={e => setDesignHasVideo(e.target.checked)} /> المنشور مقطع فيديو</label></div>
          {designSource && <p className="text-xs font-bold text-teal-700">تم إرفاق الصورة المرجعية.</p>}
          <div className="flex gap-2"><Button className="flex-1" onClick={generateDesignOptions} loading={busy === `generate-design-options:${designItem.id}`} disabled={designUploading || !designItem.post_text}>توليد الخيارات الثلاثة</Button><Button variant="outline" onClick={() => setDesignItem(null)}>إلغاء</Button></div>
        </div>
      </div>}

      {editOption && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="تعديل خيار التصميم">
        <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl"><div><h3 className="font-black text-dark">تعديل خيار التصميم</h3><p className="mt-1 text-xs text-muted">سيُحفظ التعديل داخل هذا الخيار فقط.</p></div>
          <textarea value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="اكتب التعديل المطلوب" className="min-h-28 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm" />
          <div className="flex gap-2"><Button className="flex-1" onClick={async () => { const result = await callAction('edit-design-option', { id: editOption.item.id, optionId: editOption.optionId, designNote: editNote }, 'تم تعديل خيار التصميم'); if (result?.item) setEditOption(null) }} loading={busy === `edit-design-option:${editOption.item.id}`} disabled={!editNote.trim()}>حفظ التعديل</Button><Button variant="outline" onClick={() => setEditOption(null)}>إلغاء</Button></div>
        </div>
      </div>}

      {scheduleItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"><h3 className="font-black text-dark">جدولة «{scheduleItem.title}»</h3><p className="mt-1 text-xs text-muted">الوقت بتوقيت السعودية.</p>
          <input type="datetime-local" value={scheduleWhen} onChange={e => setScheduleWhen(e.target.value)} className="mt-4 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          <div className="mt-4 flex gap-2"><Button className="flex-1" onClick={schedule} loading={busy === `schedule:${scheduleItem.id}`}>تأكيد الجدولة</Button><Button className="flex-1" variant="outline" onClick={() => setScheduleItem(null)}>إلغاء</Button></div>
        </div>
      </div>}
    </div>
  )
}
