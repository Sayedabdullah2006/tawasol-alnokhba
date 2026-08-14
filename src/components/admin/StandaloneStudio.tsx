'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageLightbox from '@/components/ui/ImageLightbox'
import { StepHead } from '@/components/admin/StudioStep'
import ScheduleSuggestions from '@/components/admin/ScheduleSuggestions'
import ImageEditSchedule from '@/components/admin/ImageEditSchedule'
import { SECTION_NAMES } from '@/lib/showcase-sections'

type StepKey = 'analyze' | 'tweets' | 'concepts' | 'image'
interface ConceptItem { title?: string; mood?: string; brief?: string; imagePrompt?: string }
interface DesignResult { title: string; imageUrl: string; brief: string; preparedPrompt?: string }
interface StudioHistoryItem {
  id: string
  title: string | null
  content: string | null
  category: string | null
  image_url: string
  source_image_url: string | null
  created_at: string
}

interface StudioApiResponse {
  analysis?: unknown
  tweets?: string
  concepts?: ConceptItem[]
  imageUrl?: string
  error?: string
}

function createUploadPath(prefix: string, fileName: string) {
  const ext = fileName.split('.').pop() || 'jpg'
  return `${prefix}-${crypto.randomUUID()}.${ext}`
}

/**
 * استوديو الذكاء الاصطناعي المستقل (بلا طلب) — عديم الحالة.
 * منفصل تماماً عن استوديو الطلبات (AIStudioPanel) ومساره.
 */
export default function StandaloneStudio() {
  const { showToast } = useToast()
  const supabase = createClient()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [extraInfo, setExtraInfo] = useState('')
  const [hasVideo, setHasVideo] = useState(false)
  const [videoOrientation, setVideoOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [uploading, setUploading] = useState(false)
  // تضمين تصميم مميّز في «مجلة المبدعين»
  const [magazineCategory, setMagazineCategory] = useState('')
  const [featuredCover, setFeaturedCover] = useState<string | null>(null)
  const [featuringCover, setFeaturingCover] = useState<string | null>(null)
  // النشر عبر القنوات
  const [publishCover, setPublishCover] = useState<string | null>(null)
  const [publishText, setPublishText] = useState('')
  const [publishingCover, setPublishingCover] = useState<string | null>(null)
  const [publishedCover, setPublishedCover] = useState<string | null>(null)
  // تبويب الإنفوجرافيك (عدة أشخاص)
  const [mode, setMode] = useState<'news' | 'info' | 'upload' | 'history'>('news')
  const [infoTitle, setInfoTitle] = useState('')
  const [infoExtra, setInfoExtra] = useState('')
  const [people, setPeople] = useState<{ imageUrl: string; name: string; blurb: string }[]>([{ imageUrl: '', name: '', blurb: '' }])
  const [personUploading, setPersonUploading] = useState<number | null>(null)
  const [infoBusy, setInfoBusy] = useState(false)
  const [infoResults, setInfoResults] = useState<{ imageUrl: string; direction: string }[]>([])
  const [infoTweets, setInfoTweets] = useState('')
  const [history, setHistory] = useState<StudioHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const response = await fetch('/api/admin/ai-studio/history', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تحميل سجل الاستديو')
      setHistory(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تحميل سجل الاستديو', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  const selectMode = (nextMode: 'news' | 'info' | 'upload' | 'history') => {
    setMode(nextMode)
    if (nextMode === 'history') void loadHistory()
  }

  const updatePerson = (i: number, patch: Partial<{ imageUrl: string; name: string; blurb: string }>) =>
    setPeople(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const addPerson = () => setPeople(prev => [...prev, { imageUrl: '', name: '', blurb: '' }])
  const removePerson = (i: number) => setPeople(prev => prev.filter((_, idx) => idx !== i))

  const uploadPersonImage = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) { showToast('صيغة غير مدعومة', 'error'); return }
    if (file.size > 10 * 1024 * 1024) { showToast('الحجم يتجاوز 10MB', 'error'); return }
    setPersonUploading(i)
    try {
      const path = createUploadPath('info', file.name)
      const { error } = await supabase.storage.from('content-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      updatePerson(i, { imageUrl: data.publicUrl })
      showToast('تم رفع الصورة', 'success')
    } catch { showToast('فشل رفع الصورة', 'error') } finally { setPersonUploading(null) }
  }

  const genInfographic = async () => {
    const valid = people.filter(p => p.imageUrl && p.name.trim())
    if (!valid.length) { showToast('أضِف صورة شخص واحدة على الأقل مع اسمه', 'error'); return }
    setInfoBusy(true); setInfoResults([]); setInfoTweets('')
    try {
      const res = await fetch('/api/admin/ai-studio/infographic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: infoTitle, extraInfo: infoExtra, people: valid }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setInfoResults(Array.isArray(d.images) ? d.images : []); setInfoTweets(d.tweets ?? ''); showToast('تم توليد الاتجاهات ✅', 'success') }
      else showToast(d.error ?? 'فشل التوليد', 'error')
    } finally { setInfoBusy(false) }
  }

  const toggleImage = (url: string) =>
    setSelectedImages(prev => (prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]))

  const [analysis, setAnalysis] = useState<unknown>(null)
  const [tweets, setTweets] = useState('')
  const [selectedTweet, setSelectedTweet] = useState('')
  const [conceptItems, setConceptItems] = useState<ConceptItem[]>([])
  const [chosenConcept, setChosenConcept] = useState('')
  const [chosenPreparedPrompt, setChosenPreparedPrompt] = useState<string | undefined>()
  const [loadingStep, setLoadingStep] = useState<StepKey | null>(null)

  const [batchResults, setBatchResults] = useState<DesignResult[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')
  const designResultsRef = useRef<HTMLDivElement | null>(null)
  const [noteByIndex, setNoteByIndex] = useState<Record<number, string>>({})
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  // إعادة توليد كل التصاميم بملاحظة مشتركة
  const [bulkNote, setBulkNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  // ⚡ التوليد التلقائي لكل الخطوات
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoStage, setAutoStage] = useState('')
  // 🗓️ جدولة المنشور بتوقيت السعودية
  const [scheduleCover, setScheduleCover] = useState<string | null>(null)
  const [scheduleText, setScheduleText] = useState('')
  const [scheduleWhen, setScheduleWhen] = useState('')
  const [schedulingCover, setSchedulingCover] = useState<string | null>(null)
  const [scheduledCover, setScheduledCover] = useState<string | null>(null)

  useEffect(() => {
    if ((autoBusy || batchLoading) && batchResults.length > 0) {
      designResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [autoBusy, batchLoading, batchResults.length])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      showToast('صيغة غير مدعومة (PNG/JPG/WEBP)', 'error'); return
    }
    if (file.size > 10 * 1024 * 1024) { showToast('الحجم يتجاوز 10 ميجابايت', 'error'); return }
    setUploading(true)
    try {
      const path = createUploadPath('studio-src', file.name)
      const { error } = await supabase.storage.from('content-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      setImages(prev => [...prev, data.publicUrl])
      setSelectedImages(prev => [...prev, data.publicUrl])
      showToast('تم رفع الصورة', 'success')
    } catch {
      showToast('فشل رفع الصورة', 'error')
    } finally {
      setUploading(false)
    }
  }

  const post = async (payload: Record<string, unknown>): Promise<StudioApiResponse | null> => {
    const res = await fetch('/api/admin/ai-studio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { showToast(data.error ?? 'فشل الطلب', 'error'); return null }
    return data as StudioApiResponse
  }

  const callStep = async (step: StepKey) => {
    if (!content.trim()) { showToast('أدخل نص الخبر أولاً', 'error'); return }
    setLoadingStep(step)
    try {
      const data = await post({
        step, title, content, sourceImages: selectedImages, extraInfo, analysis,
        chosenConcept: step === 'image' ? chosenConcept : undefined,
        preparedPrompt: step === 'image' ? chosenPreparedPrompt : undefined,
        hasVideo,
        videoOrientation,
        // عند إعادة اقتراح الاتجاهات: استبعد الحالية لتأتي بدائل مختلفة
        previousConcepts: step === 'concepts' ? conceptItems.map(c => c.title ?? '').filter(Boolean) : undefined,
      })
      if (!data) return
      if (step === 'analyze') { setAnalysis(data.analysis); showToast('تم التحليل', 'success') }
      else if (step === 'tweets') { setTweets(data.tweets ?? ''); setSelectedTweet(data.tweets ?? ''); showToast('تم توليد التغريدات', 'success') }
      else if (step === 'concepts') { setConceptItems(Array.isArray(data.concepts) ? data.concepts : []); showToast('تم اقتراح الاتجاهات', 'success') }
      else if (step === 'image') {
        if (data.imageUrl) {
          setBatchResults(prev => [...prev, { title: 'تصميم مفرد', imageUrl: data.imageUrl!, brief: chosenConcept, preparedPrompt: chosenPreparedPrompt }])
        }
        showToast('تم توليد التصميم', 'success')
      }
    } finally { setLoadingStep(null) }
  }

  // توليد تصميم واحد بقيمة تحليل صريحة (لاستخدامه في المسار التلقائي قبل تحديث الحالة)
  const genOneWith = async (brief: string, analysisVal: unknown, note?: string, preparedPrompt?: string): Promise<string | null> => {
    const data = await post({ step: 'image', title, content, sourceImages: selectedImages, extraInfo, analysis: analysisVal, chosenConcept: brief, note, hasVideo, videoOrientation, preparedPrompt })
    return data?.imageUrl ?? null
  }
  const genOne = (brief: string, note?: string, preparedPrompt?: string) => genOneWith(brief, analysis, note, preparedPrompt)

  // ⚡ التوليد التلقائي لكل الخطوات: تحليل → تغريدات → اتجاهات → تصميم الاتجاهات الثلاثة.
  // يمرّر التحليل محلياً (لا ينتظر تحديث الحالة) لتسلسل موثوق.
  const autoRun = async () => {
    if (!content.trim()) { showToast('أدخل نص الخبر أولاً', 'error'); return }
    if (!selectedImages.length) { showToast('ارفع صورة المصدر أولاً', 'error'); return }
    setAutoBusy(true)
    setBatchResults([]); setNoteByIndex({})
    setTweets(''); setConceptItems([])
    try {
      const base = { title, content, sourceImages: selectedImages, extraInfo, hasVideo, videoOrientation }

      setAutoStage('① تحليل الخبر…')
      const aRes = await post({ step: 'analyze', ...base })
      if (!aRes) return
      const a = aRes.analysis
      setAnalysis(a)

      setAutoStage('② كتابة التغريدات…')
      const tRes = await post({ step: 'tweets', ...base, analysis: a })
      if (tRes) { setTweets(tRes.tweets ?? ''); setSelectedTweet(tRes.tweets ?? '') }

      setAutoStage('③ اقتراح الاتجاهات…')
      const cRes = await post({ step: 'concepts', ...base, analysis: a })
      const concepts: ConceptItem[] = Array.isArray(cRes?.concepts) ? cRes.concepts : []
      setConceptItems(concepts)
      if (!concepts.length) { showToast('تعذّر اقتراح الاتجاهات', 'error'); return }

      const results: DesignResult[] = []
      for (let i = 0; i < concepts.length; i++) {
        setAutoStage(`④ توليد التصميم ${i + 1}/${concepts.length}…`)
        const brief = concepts[i].brief ?? concepts[i].title ?? ''
        const url = await genOneWith(brief, a, undefined, concepts[i].imagePrompt)
        if (url) {
          const result = { title: concepts[i].title ?? `اتجاه ${i + 1}`, imageUrl: url, brief, preparedPrompt: concepts[i].imagePrompt }
          results.push(result)
          setBatchResults(prev => [...prev, result])
        }
      }
      showToast(results.length ? `اكتمل التوليد التلقائي — ${results.length} تصاميم ✅` : 'لم يُولَّد أي تصميم', results.length ? 'success' : 'error')
    } finally {
      setAutoBusy(false); setAutoStage('')
    }
  }

  const designAll = async () => {
    if (!conceptItems.length) return
    if (!selectedImages.length) { showToast('ارفع صورة المصدر أولاً', 'error'); return }
    setBatchLoading(true); setBatchResults([]); setNoteByIndex({})
    try {
      const results: DesignResult[] = []
      for (let i = 0; i < conceptItems.length; i++) {
        setBatchProgress(`جارٍ توليد ${i + 1}/${conceptItems.length}…`)
        const brief = conceptItems[i].brief ?? conceptItems[i].title ?? ''
        const url = await genOneWith(brief, analysis, undefined, conceptItems[i].imagePrompt)
        if (url) {
          const result = { title: conceptItems[i].title ?? `اتجاه ${i + 1}`, imageUrl: url, brief, preparedPrompt: conceptItems[i].imagePrompt }
          results.push(result)
          setBatchResults(prev => [...prev, result])
        }
      }
      if (results.length) showToast(`تم توليد ${results.length} تصاميم`, 'success')
    } finally { setBatchLoading(false); setBatchProgress('') }
  }

  const regenerate = async (i: number) => {
    const r = batchResults[i]; const note = (noteByIndex[i] ?? '').trim()
    if (!r || !note) { showToast('اكتب ملاحظة لإعادة التوليد', 'error'); return }
    setRegenIndex(i)
    try {
      const url = await genOne(r.brief, note, r.preparedPrompt)
      if (url) { setBatchResults(prev => prev.map((x, idx) => idx === i ? { ...x, imageUrl: url } : x)); showToast('تم إعادة التوليد', 'success') }
    } finally { setRegenIndex(null) }
  }

  // تعديل دقيق: يطبّق التعديل على نفس التصميم (لا يعيد التوليد من معطيات الخبر)
  const editOne = async (i: number) => {
    const r = batchResults[i]; const note = (noteByIndex[i] ?? '').trim()
    if (!r || !note) { showToast('اكتب التعديل المطلوب', 'error'); return }
    setEditIndex(i)
    try {
      const res = await fetch('/api/admin/ai-studio/edit-design', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: r.imageUrl, note }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'فشل التعديل', 'error'); return }
      setBatchResults(prev => prev.map((x, idx) => idx === i ? { ...x, imageUrl: d.imageUrl } : x))
      showToast('تم التعديل الدقيق على نفس التصميم ✅', 'success')
    } finally { setEditIndex(null) }
  }

  // إعادة توليد كل التصاميم بملاحظة واحدة مشتركة (حذف/إضافة نص أو تعديل عام)
  const regenerateAllWithNote = async () => {
    if (!batchResults.length) return
    const note = bulkNote.trim()
    if (!note) { showToast('اكتب ملاحظة لإعادة توليد الكل', 'error'); return }
    setBulkBusy(true)
    try {
      for (let i = 0; i < batchResults.length; i++) {
        setBulkProgress(`جارٍ إعادة التوليد ${i + 1}/${batchResults.length}…`)
        const url = await genOne(batchResults[i].brief, note, batchResults[i].preparedPrompt)
        if (url) setBatchResults(prev => prev.map((x, idx) => idx === i ? { ...x, imageUrl: url } : x))
      }
      showToast('تم إعادة توليد كل التصاميم بالملاحظة ✅', 'success')
    } finally { setBulkBusy(false); setBulkProgress('') }
  }

  // تضمين تصميم واحد مميّز في «مجلة المبدعين»
  const featureInMagazine = async (cover: string) => {
    if (!title.trim()) { showToast('أدخل عنوان/اسم الخبر أولاً', 'error'); return }
    setFeaturingCover(cover)
    try {
      const res = await fetch('/api/admin/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'standalone',
          cover,
          name: title,
          title,
          category: magazineCategory,
          story: content,
          tweets: selectedTweet,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'تعذّر التضمين في المجلة', 'error'); return }
      setFeaturedCover(cover)
      showToast('تم تضمين التصميم في مجلة المبدعين ⭐', 'success')
    } catch {
      showToast('حدث خطأ أثناء التضمين', 'error')
    } finally {
      setFeaturingCover(null)
    }
  }

  // النشر عبر القنوات (Post-Pulse) — مع معاينة/تعديل قبل النشر
  const openPublish = (cover: string) => { setPublishText(selectedTweet || ''); setPublishCover(cover) }
  const confirmPublish = async () => {
    const cover = publishCover
    if (!cover) return
    if (!publishText.trim()) { showToast('اكتب نص المنشور أولاً', 'error'); return }
    setPublishingCover(cover)
    try {
      const res = await fetch('/api/postpulse/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: publishText, imageUrl: cover }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'فشل النشر', 'error'); return }
      setPublishedCover(cover)
      setPublishCover(null)
      const n = Array.isArray(d.accountIds) ? d.accountIds.length : 0
      showToast(`أُرسل إلى ${n} قناة — تابع الحالة في Post‑Pulse 📣`, 'success')
    } catch {
      showToast('حدث خطأ أثناء النشر', 'error')
    } finally {
      setPublishingCover(null)
    }
  }

  // جدولة المنشور (Post-Pulse) بموعد محدّد بتوقيت السعودية لكل القنوات
  const openSchedule = (cover: string) => { setScheduleText(selectedTweet || ''); setScheduleWhen(''); setScheduleCover(cover) }
  const confirmSchedule = async () => {
    const cover = scheduleCover
    if (!cover) return
    if (!scheduleText.trim()) { showToast('اكتب نص المنشور أولاً', 'error'); return }
    if (!scheduleWhen) { showToast('حدّد تاريخ ووقت الجدولة', 'error'); return }
    setSchedulingCover(cover)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: scheduleText, imageUrl: cover, scheduledLocal: scheduleWhen }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'فشل الجدولة', 'error'); return }
      setScheduledCover(cover)
      setScheduleCover(null)
      const n = Array.isArray(d.accountIds) ? d.accountIds.length : 0
      showToast(`تمت الجدولة في ${n} قناة بتوقيت السعودية 🗓️`, 'success')
    } catch {
      showToast('حدث خطأ أثناء الجدولة', 'error')
    } finally {
      setSchedulingCover(null)
    }
  }

  const card = 'bg-card rounded-2xl border border-border p-5 space-y-3 shadow-sm'

  return (
    <div className="space-y-4" dir="rtl">
      {/* تبويبات الاستوديو المستقل */}
      <div className="flex max-w-full overflow-x-auto rounded-xl border border-border overscroll-x-contain">
        <button onClick={() => selectMode('news')} className={`shrink-0 px-4 py-2 text-sm font-bold ${mode === 'news' ? 'bg-green text-white' : 'bg-card text-dark'}`}>📰 تصميم خبر</button>
        <button onClick={() => selectMode('info')} className={`shrink-0 px-4 py-2 text-sm font-bold ${mode === 'info' ? 'bg-green text-white' : 'bg-card text-dark'}`}>📊 إنفوجرافيك</button>
        <button onClick={() => selectMode('upload')} className={`shrink-0 px-4 py-2 text-sm font-bold ${mode === 'upload' ? 'bg-green text-white' : 'bg-card text-dark'}`}>✂️ رفع وتعديل صورة</button>
        <button onClick={() => selectMode('history')} className={`shrink-0 px-4 py-2 text-sm font-bold ${mode === 'history' ? 'bg-green text-white' : 'bg-card text-dark'}`}>سجل المنشورات</button>
      </div>

      {mode === 'upload' && <ImageEditSchedule />}

      {mode === 'history' && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-black text-dark">سجل الاستديو المستقل</h3><p className="mt-1 text-xs text-muted">كل التصاميم والنصوص التي تم توليدها سابقًا من هذا الاستديو.</p></div>
          <Button size="sm" variant="outline" onClick={() => void loadHistory()} loading={historyLoading}>تحديث</Button>
        </div>
        {historyLoading ? <div className="py-10"><LoadingSpinner /></div> : history.length ? <div className="grid gap-4 sm:grid-cols-2">
          {history.map(item => <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={() => setLightbox(item.image_url)} className="block w-full bg-cream" aria-label={`تكبير تصميم ${item.title || 'الاستديو'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt={item.title || 'تصميم مولد من الاستديو'} className="aspect-[4/5] w-full object-cover" />
            </button>
            <div className="space-y-2 p-3"><div className="flex items-start justify-between gap-2"><h4 className="min-w-0 font-bold text-dark">{item.title || 'تصميم من الاستديو'}</h4>{item.category && <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-800">{item.category}</span>}</div>
              {item.content && <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-muted">{item.content}</p>}
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted"><span>{new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(item.created_at))}</span>{item.content && <button type="button" onClick={() => void navigator.clipboard?.writeText(item.content ?? '').then(() => showToast('تم نسخ النص', 'success')).catch(() => showToast('تعذّر نسخ النص', 'error'))} className="font-bold text-green hover:underline">نسخ النص</button>}</div>
            </div>
          </article>)}
        </div> : <div className="rounded-xl border border-dashed border-border bg-cream p-8 text-center text-sm text-muted">لا توجد منشورات مولدة في سجل الاستديو حتى الآن.</div>}
      </div>}

      {mode === 'info' && (
        <div className="space-y-4">
          <div className={card}>
            <h3 className="font-bold text-dark">📊 إنفوجرافيك عدّة أشخاص</h3>
            <p className="text-xs text-muted">أضِف صورة كل شخص مع اسمه ونبذته — يلتزم التصميم بالصورة والاسم والنبذة لكل شخص بدقّة.</p>
            <input value={infoTitle} onChange={e => setInfoTitle(e.target.value)} placeholder="عنوان الإنفوجرافيك (مثال: أوائل سعوديون هذا الأسبوع)"
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm font-semibold" />
            <div className="space-y-3">
              {people.map((p, i) => (
                <div key={i} className="rounded-xl border border-border p-3 flex gap-3">
                  <div className="shrink-0">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="w-20 aspect-square object-cover rounded-lg border border-border" />
                    ) : (
                      <label className="w-20 aspect-square rounded-lg border border-dashed border-border flex items-center justify-center text-[10px] text-muted cursor-pointer text-center px-1 hover:border-green">
                        <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={e => uploadPersonImage(i, e)} disabled={personUploading === i} className="hidden" />
                        {personUploading === i ? 'جارٍ…' : '⬆️ صورة'}
                      </label>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input value={p.name} onChange={e => updatePerson(i, { name: e.target.value })} placeholder="اسم الشخص"
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-sm font-bold" />
                    <textarea value={p.blurb} onChange={e => updatePerson(i, { blurb: e.target.value })} placeholder="نبذة مختصرة عن الشخص/إنجازه"
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs min-h-[48px] resize-y" />
                    <div className="flex gap-2">
                      {p.imageUrl && (
                        <label className="text-[11px] text-green cursor-pointer hover:underline">
                          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={e => uploadPersonImage(i, e)} className="hidden" />
                          تغيير الصورة
                        </label>
                      )}
                      {people.length > 1 && (
                        <button onClick={() => removePerson(i)} className="text-[11px] text-red-600 hover:underline">حذف</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addPerson} className="text-sm font-bold text-green border border-green/30 rounded-lg px-3 py-1.5 hover:bg-green/5">➕ إضافة شخص</button>
            </div>
            <textarea value={infoExtra} onChange={e => setInfoExtra(e.target.value)} placeholder="معلومات إضافية (اختياري) تُراعى في التصميم"
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[60px] resize-y" />
            {/* ⚡ التوليد التلقائي لكل الخطوات دفعة واحدة (تصميم + تغريدات) */}
            <div className="rounded-xl border border-green/40 bg-green/5 p-3 space-y-2">
              <p className="text-[11px] text-muted">⚡ التوليد التلقائي: زر واحد يولّد ٣ اتجاهات تصميم + ٣ تغريدات مقترحة دفعة واحدة.</p>
              <Button onClick={genInfographic} loading={infoBusy} disabled={infoBusy} size="sm">⚡ توليد تلقائي (٣ اتجاهات + تغريدات)</Button>
              {infoBusy && <div className="flex items-center gap-2 text-sm text-green-700"><LoadingSpinner size="sm" /><span>جارٍ التوليد التلقائي… قد يستغرق دقيقتين</span></div>}
            </div>
          </div>

          {infoResults.length > 0 && (
            <div className={card}>
              <h4 className="font-bold text-dark">الاتجاهات ({infoResults.length}) — اختر تصميماً</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {infoResults.map((r, i) => (
                  <div key={i} className="rounded-xl border border-border p-2 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.imageUrl} alt={r.direction} onClick={() => setLightbox(r.imageUrl)} className="w-full aspect-[4/5] object-cover rounded-lg border border-border cursor-zoom-in" />
                    <p className="text-[10px] text-muted line-clamp-1">{r.direction}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button onClick={() => openPublish(r.imageUrl)} loading={publishingCover === r.imageUrl} disabled={publishingCover !== null} variant={publishedCover === r.imageUrl ? 'secondary' : 'outline'} size="sm">
                        {publishedCover === r.imageUrl ? '✅ أُرسل' : '📣 نشر'}
                      </Button>
                      <Button onClick={() => openSchedule(r.imageUrl)} disabled={schedulingCover !== null} variant={scheduledCover === r.imageUrl ? 'secondary' : 'outline'} size="sm">
                        {scheduledCover === r.imageUrl ? '🗓️ مجدول' : '🗓️ جدولة'}
                      </Button>
                      <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-green/10 text-green hover:bg-green/20">⬇️</a>
                    </div>
                  </div>
                ))}
              </div>
              {infoTweets && (
                <div className="bg-cream rounded-xl p-3 mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-green">٣ تغريدات مقترحة</span>
                    <button onClick={() => { navigator.clipboard?.writeText(infoTweets); showToast('تم النسخ') }} className="text-xs text-green font-bold hover:underline">نسخ</button>
                  </div>
                  <p className="text-xs text-dark/80 whitespace-pre-wrap leading-relaxed">{infoTweets}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'news' && (<>
      {/* الخبر */}
      <div className={card}>
        <h3 className="font-bold text-dark">📝 الخبر</h3>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان الخبر"
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm font-semibold" />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="نص الخبر / التفاصيل..."
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[120px] resize-y" />
        {/* صور المصدر — يمكن اختيار أكثر من صورة لتُضمَّن جميعها في التصميم */}
        {images.length > 0 && (
          <>
            <p className="text-xs text-muted">اختر صورة أو أكثر لتُضمَّن في التصميم ويُبنى عليها التحليل والاتجاهات:</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map(url => {
                const on = selectedImages.includes(url)
                return (
                  <button key={url} type="button" onClick={() => toggleImage(url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 ${on ? 'border-green ring-2 ring-green/30' : 'border-border'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="مصدر" className="w-full h-full object-cover" />
                    {on && <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-green text-white text-xs flex items-center justify-center">✓</span>}
                  </button>
                )
              })}
            </div>
            {selectedImages.length > 0 && <p className="text-[11px] text-green-700">المحددة: {selectedImages.length}</p>}
          </>
        )}
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-sm text-muted hover:border-green hover:text-green cursor-pointer">
          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleUpload} disabled={uploading} className="hidden" />
          {uploading ? 'جارٍ الرفع...' : '⬆️ رفع صورة المصدر'}
        </label>
        {/* معلومات إضافية قبل التحليل */}
        <textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} placeholder="معلومات إضافية (اختياري) — تُراعى في التحليل والاتجاهات والتصميم..."
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[70px] resize-y" />
        {/* خيار الفيديو — يولّد تصميماً بمساحة فيديو عريضة فارغة + صورة الشخص في إطار */}
        <label className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition ${hasVideo ? 'border-amber-400 bg-amber-50' : 'border-border bg-white hover:border-amber-300'}`}>
          <input type="checkbox" checked={hasVideo} onChange={e => setHasVideo(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500" />
          <span className="text-sm">
            <span className="font-bold text-dark">🎬 الخبر يتضمّن فيديو</span>
            <span className="block text-[11px] text-muted mt-0.5">يُحجز قالب كبير للمقطع، مع ترتيب المحتوى حوله وفق اتجاهه.</span>
          </span>
        </label>
        {hasVideo && <div className="grid grid-cols-2 gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2" role="group" aria-label="اتجاه مقطع الفيديو">
          <button type="button" onClick={() => setVideoOrientation('portrait')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${videoOrientation === 'portrait' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-dark'}`}>عمودي 9:16</button>
          <button type="button" onClick={() => setVideoOrientation('landscape')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${videoOrientation === 'landscape' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-dark'}`}>أفقي 16:9</button>
        </div>}
      </div>

      {/* ⚡ التوليد التلقائي لكل الخطوات دفعة واحدة */}
      <div className={`${card} border-green/40 bg-green/5`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="font-bold text-dark">⚡ توليد تلقائي لكل الخطوات</h4>
            <p className="text-[11px] text-muted mt-0.5">تحليل ← تغريدات ← اتجاهات ← تصميم الاتجاهات الثلاثة، دفعة واحدة.</p>
          </div>
          <Button onClick={autoRun} loading={autoBusy} disabled={autoBusy || loadingStep !== null || batchLoading || !content.trim() || !selectedImages.length} size="sm">
            ⚡ ابدأ التوليد التلقائي
          </Button>
        </div>
        {autoBusy && <div className="flex items-center gap-2 text-sm text-green-700"><LoadingSpinner size="sm" /><span>{autoStage || 'جارٍ التوليد…'}</span></div>}
        {!content.trim() && <p className="text-[11px] text-amber-600">أدخل نص الخبر وارفع صورة المصدر لتفعيل التوليد التلقائي.</p>}
      </div>

      {/* 1 تحليل */}
      <div className={card}>
        <StepHead n={1} title="تحليل الخبر" subtitle="استخراج عناصر الخبر لبناء المحتوى" done={!!analysis} />
        <Button onClick={() => callStep('analyze')} loading={loadingStep === 'analyze'} disabled={autoBusy || loadingStep !== null || !content.trim()} size="sm">حلّل الخبر</Button>
        {analysis != null && <pre dir="rtl" className="bg-cream rounded-xl p-3 text-xs whitespace-pre-wrap max-h-72 overflow-y-auto border border-border">{JSON.stringify(analysis, null, 2)}</pre>}
      </div>

      {/* 2 تغريدات */}
      <div className={card}>
        <StepHead n={2} title="التغريدات" subtitle="٣ تغريدات بزوايا ومطالع متنوّعة" done={!!tweets} />
        <Button onClick={() => callStep('tweets')} loading={loadingStep === 'tweets'} disabled={autoBusy || loadingStep !== null || !analysis} size="sm">اكتب 3 تغريدات</Button>
        {tweets && (
          <div className="space-y-2">
            <pre dir="rtl" className="bg-cream rounded-xl p-3 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto border border-border">{tweets}</pre>
            <textarea value={selectedTweet} onChange={e => setSelectedTweet(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[80px] resize-y" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(selectedTweet); showToast('تم نسخ التغريدة') }}>📋 نسخ التغريدة</Button>
          </div>
        )}
      </div>

      {/* 3 اتجاهات */}
      <div className={card}>
        <StepHead n={3} title="اتجاهات التصميم" subtitle="٣ اتجاهات مختلفة للاختيار منها" done={conceptItems.length > 0} />
        <Button onClick={() => callStep('concepts')} loading={loadingStep === 'concepts'} disabled={autoBusy || loadingStep !== null || !analysis} size="sm">اقترح 3 اتجاهات</Button>
        {conceptItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {conceptItems.map((c, i) => {
              const brief = c.brief ?? c.title ?? ''
              const on = chosenConcept === brief
              return (
                <div key={i} className={`rounded-xl border p-3 text-xs space-y-1 ${on ? 'border-green ring-2 ring-green/30 bg-green/5' : 'border-border bg-cream'}`}>
                  <div className="font-bold text-dark">{c.title ?? `اتجاه ${i + 1}`}</div>
                  {c.mood && <div className="text-[11px] text-green-700">{c.mood}</div>}
                  <p className="text-[11px] text-muted whitespace-pre-wrap max-h-32 overflow-y-auto">{brief}</p>
                  <button type="button" onClick={() => { setChosenConcept(brief); setChosenPreparedPrompt(c.imagePrompt) }}
                    className={`mt-1 w-full rounded-lg py-1 text-[11px] font-bold ${on ? 'bg-green text-white' : 'bg-white border border-border text-dark hover:border-green'}`}>
                    {on ? '✓ معتمد' : 'اعتمد'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <textarea value={chosenConcept} onChange={e => { setChosenConcept(e.target.value); setChosenPreparedPrompt(undefined) }} placeholder="الاتجاه المعتمد (اعتمد أحد الاتجاهات أو اكتب يدوياً)"
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[70px] resize-y" />
      </div>

      {/* 4 تصاميم */}
      <div className={card}>
        <StepHead n={4} title="التصاميم" subtitle="صمّم الاتجاهات أو الاتجاه المعتمد" done={batchResults.length > 0} />
        <Button onClick={designAll} loading={batchLoading} disabled={autoBusy || batchLoading || loadingStep !== null || !analysis || !selectedImages.length || conceptItems.length === 0} size="sm">🎨 صمّم الاتجاهات الثلاثة</Button>
        {batchLoading && <div className="flex items-center gap-2 text-sm text-muted"><LoadingSpinner size="sm" /><span>{batchProgress || 'جارٍ التوليد…'}</span></div>}
        {autoBusy && autoStage.includes('توليد التصميم') && <div className="mt-3 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm font-bold text-teal-900"><LoadingSpinner size="sm" /><span>{autoStage}</span></div>}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted mb-2">أو صمّم الاتجاه المعتمد (تصميم واحد):</p>
          <Button onClick={() => callStep('image')} loading={loadingStep === 'image'} disabled={autoBusy || loadingStep !== null || batchLoading || !analysis || !selectedImages.length || !chosenConcept.trim()} variant="outline" size="sm">صمّم الصورة (مفرد)</Button>
        </div>

        {batchResults.length > 0 && (
          <div ref={designResultsRef} className="space-y-3 pt-2">
            {/* إعادة توليد كل التصاميم بملاحظة واحدة (حذف نص/إضافة نص/تعديل عام) */}
            <div className="rounded-xl border border-green/40 bg-green/5 p-3 space-y-2">
              <p className="text-[11px] text-muted">✍️ ملاحظة تُطبَّق على كل التصاميم الثلاثة معاً — مثل: احذف نص «كذا»، أضِف «كذا»، أو تعديل عام على التصميم.</p>
              <textarea value={bulkNote} onChange={e => setBulkNote(e.target.value)} disabled={bulkBusy}
                placeholder="اكتب ملاحظة لإعادة توليد كل التصاميم..." className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[60px] resize-y" />
              <div className="flex items-center gap-2">
                <Button onClick={regenerateAllWithNote} loading={bulkBusy} disabled={bulkBusy || regenIndex !== null || !bulkNote.trim()} size="sm">
                  🔁 أعد توليد الكل بالملاحظة
                </Button>
                {bulkBusy && <span className="text-xs text-green-700 flex items-center gap-1.5"><LoadingSpinner size="sm" />{bulkProgress}</span>}
              </div>
            </div>
            {batchResults.map((r, i) => (
              <div key={i} className="rounded-xl border border-border p-2 flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.imageUrl} alt={r.title} onClick={() => setLightbox(r.imageUrl)} className="w-24 flex-shrink-0 aspect-[4/5] object-cover rounded-lg border border-border cursor-zoom-in" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="font-bold text-dark text-xs">{r.title}</div>
                  <textarea value={noteByIndex[i] ?? ''} onChange={e => setNoteByIndex(p => ({ ...p, [i]: e.target.value }))}
                    placeholder="ملاحظة/تعديل مطلوب..." className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs min-h-[48px] resize-y" />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => editOne(i)} loading={editIndex === i} disabled={editIndex !== null || regenIndex !== null || !(noteByIndex[i] ?? '').trim()} size="sm">✂️ تعديل دقيق (نفس التصميم)</Button>
                    <Button onClick={() => regenerate(i)} loading={regenIndex === i} disabled={regenIndex !== null || editIndex !== null || !(noteByIndex[i] ?? '').trim()} variant="outline" size="sm">🔄 إعادة توليد (تصميم جديد)</Button>
                    <Button onClick={() => featureInMagazine(r.imageUrl)} loading={featuringCover === r.imageUrl} disabled={featuringCover !== null} variant={featuredCover === r.imageUrl ? 'secondary' : 'outline'} size="sm">
                      {featuredCover === r.imageUrl ? '⭐ مميّز في المجلة' : '⭐ ضمّن في المجلة'}
                    </Button>
                    <Button onClick={() => openPublish(r.imageUrl)} loading={publishingCover === r.imageUrl} disabled={publishingCover !== null} variant={publishedCover === r.imageUrl ? 'secondary' : 'outline'} size="sm">
                      {publishedCover === r.imageUrl ? '✅ أُرسل' : '📣 انشر عبر القنوات'}
                    </Button>
                    <Button onClick={() => openSchedule(r.imageUrl)} disabled={schedulingCover !== null} variant={scheduledCover === r.imageUrl ? 'secondary' : 'outline'} size="sm">
                      {scheduledCover === r.imageUrl ? '🗓️ مجدول' : '🗓️ جدولة'}
                    </Button>
                    <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" download
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-green/10 text-green hover:bg-green/20">⬇️ تنزيل</a>
                  </div>
                </div>
              </div>
            ))}
            {/* تصنيف المجلة (يُستخدم عند تضمين التصميم في «مجلة المبدعين») */}
            <div className="border-t border-border pt-3">
              <label className="block text-xs font-medium text-dark mb-1">قسم المجلة عند التضمين:</label>
              <select value={magazineCategory} onChange={e => setMagazineCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm">
                <option value="">🪄 تلقائي (حسب المحتوى)</option>
                {SECTION_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
      </>)}

      {/* نافذة معاينة/تعديل قبل النشر عبر القنوات */}
      {publishCover && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => publishingCover ? null : setPublishCover(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-black text-dark text-base">📣 النشر عبر القنوات</h3>
              <p className="text-xs text-muted mt-0.5">سيُنشر النص أدناه مع التصميم في كل القنوات المربوطة فوراً.</p>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publishCover} alt="التصميم" className="w-32 mx-auto aspect-[4/5] object-cover rounded-xl border border-border" />
              <div>
                <label className="block text-xs font-bold text-dark mb-1">نص المنشور (عدّله قبل النشر):</label>
                <textarea value={publishText} onChange={e => setPublishText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[140px] resize-y"
                  placeholder="اكتب نص المنشور..." />
                <p className="text-[11px] text-muted mt-1">{publishText.length} حرف</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2">
              <Button onClick={confirmPublish} loading={publishingCover === publishCover} disabled={!!publishingCover || !publishText.trim()} className="flex-1">🚀 انشر الآن</Button>
              <Button variant="outline" onClick={() => setPublishCover(null)} disabled={!!publishingCover}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة جدولة المنشور بموعد بتوقيت السعودية لكل القنوات */}
      {scheduleCover && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => schedulingCover ? null : setScheduleCover(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-black text-dark text-base">🗓️ جدولة المنشور</h3>
              <p className="text-xs text-muted mt-0.5">يُنشر النص مع التصميم في كل القنوات المربوطة في الموعد المحدّد (توقيت السعودية).</p>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scheduleCover} alt="التصميم" className="w-32 mx-auto aspect-[4/5] object-cover rounded-xl border border-border" />
              <div>
                <label className="block text-xs font-bold text-dark mb-1">موعد النشر (توقيت السعودية):</label>
                <input type="datetime-local" value={scheduleWhen} onChange={e => setScheduleWhen(e.target.value)}
                  disabled={!!schedulingCover}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm mb-2" />
                <ScheduleSuggestions value={scheduleWhen} onPick={setScheduleWhen} />
              </div>
              <div>
                <label className="block text-xs font-bold text-dark mb-1">نص المنشور (عدّله قبل الجدولة):</label>
                <textarea value={scheduleText} onChange={e => setScheduleText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[140px] resize-y"
                  placeholder="اكتب نص المنشور..." />
                <p className="text-[11px] text-muted mt-1">{scheduleText.length} حرف</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2">
              <Button onClick={confirmSchedule} loading={schedulingCover === scheduleCover} disabled={!!schedulingCover || !scheduleText.trim() || !scheduleWhen} className="flex-1">🗓️ جدولة النشر</Button>
              <Button variant="outline" onClick={() => setScheduleCover(null)} disabled={!!schedulingCover}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
