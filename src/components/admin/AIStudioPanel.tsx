'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageLightbox from '@/components/ui/ImageLightbox'
import { StepHead } from '@/components/admin/StudioStep'

interface ConceptItem {
  title?: string
  mood?: string
  brief?: string
  imagePrompt?: string
}
interface DesignResult { title: string; imageUrl: string; brief: string; preparedPrompt?: string }

interface Props {
  request: any
  onUsedContent: (text: string, images: string[], reviewIndex: number) => void
  // ── وضع منشور الحملة: استوديو مستقل لكل خبر في الحملة ──
  postIndex?: number          // فهرس المنشور داخل campaign_posts (غير محدّد = الطلب المفرد)
  postTitle?: string          // عنوان منشور الحملة (للترويسة)
  postImages?: string[]       // صور هذا المنشور تحديداً
  savedStudio?: any           // الحالة المحفوظة لهذا المنشور (ai_posts[postIndex])
}

type StepKey = 'analyze' | 'tweets' | 'concepts' | 'image'

export default function AIStudioPanel({
  request,
  onUsedContent,
  postIndex,
  postTitle,
  postImages,
  savedStudio,
}: Props) {
  const { showToast } = useToast()
  const supabase = createClient()

  const isPost = postIndex !== undefined

  // الحالة المحفوظة سابقاً — من ai_posts[postIndex] (حملة) أو أعمدة الطلب (مفرد)
  const saved = isPost
    ? {
        analysis: savedStudio?.analysis ?? null,
        tweets: savedStudio?.tweets ?? null,
        concepts: savedStudio?.design_concepts ?? null,
        chosenConcept: savedStudio?.chosen_concept ?? null,
        imagePrompt: savedStudio?.image_prompt ?? '',
        sourceImage: savedStudio?.source_image ?? null,
        imageUrl: '', // المعاينة المفردة للجلسة فقط؛ الحفظ عبر designs
        designs: Array.isArray(savedStudio?.designs) ? savedStudio.designs : [],
        uploadedImages: Array.isArray(savedStudio?.uploaded_images) ? savedStudio.uploaded_images : [],
        revised: savedStudio?.revised ?? null,
      }
    : {
        analysis: request.ai_analysis ?? null,
        tweets: request.ai_tweets ?? null,
        concepts: request.ai_design_concepts ?? null,
        chosenConcept: request.ai_chosen_concept ?? null,
        imagePrompt: request.ai_image_prompt ?? '',
        sourceImage: request.ai_source_image ?? null,
        imageUrl: '',
        designs: Array.isArray(request.ai_designs) ? request.ai_designs : [],
        uploadedImages: Array.isArray(request.ai_uploaded_images) ? request.ai_uploaded_images : [],
        revised: request.ai_revised_designs ?? null,
      }

  // صور المصدر الأصلية للخبر (حملة: صور المنشور، مفرد: صور الطلب)
  const baseImages: string[] = isPost
    ? (Array.isArray(postImages) ? postImages : [])
    : (Array.isArray(request.content_images) ? request.content_images : [])
  // الصور التي رفعها الأدمن يدوياً (محفوظة وتبقى بعد إعادة التحميل)
  const [uploadedImages, setUploadedImages] = useState<string[]>(saved.uploadedImages)
  const [uploading, setUploading] = useState(false)
  // قائمة صور المصدر المعروضة = الأصلية + المرفوعة (دون تكرار)
  const contentImages: string[] = [...baseImages, ...uploadedImages.filter(u => !baseImages.includes(u))]

  // حفظ حالة الاستوديو (تصاميم/صور مرفوعة) في قاعدة البيانات لتبقى بعد إعادة التحميل
  const persistStudioState = (patch: { designs?: any[]; uploadedImages?: string[] }) => {
    fetch('/api/admin/save-studio-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        postIndex: isPost ? postIndex : undefined,
        ...patch,
      }),
    }).catch(() => { /* تجاهل أخطاء الحفظ الصامت */ })
  }

  // رفع صورة مصدر من الأدمن (إن لم توجد صورة بالخبر أو أراد صورة أخرى)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      showToast('صيغة الصورة غير مدعومة (PNG/JPG/WEBP)', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('حجم الصورة يتجاوز 10 ميجابايت', 'error')
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `ai-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('content-images').upload(path, file)
      if (upErr) throw upErr
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      setUploadedImages(prev => {
        const next = [...prev, data.publicUrl]
        persistStudioState({ uploadedImages: next }) // حفظ ليبقى بعد إعادة التحميل
        return next
      })
      setSelectedImages(prev => (prev.includes(data.publicUrl) ? prev : [...prev, data.publicUrl]))
      showToast('تم رفع الصورة', 'success')
    } catch {
      showToast('فشل رفع الصورة', 'error')
    } finally {
      setUploading(false)
    }
  }

  // ── State (prefilled from saved studio state when re-opened) ──
  // يمكن اختيار أكثر من صورة مصدر تُضمَّن جميعها ويُبنى عليها التحليل والاتجاهات والتصميم.
  const [selectedImages, setSelectedImages] = useState<string[]>(
    saved.sourceImage ? [saved.sourceImage] : (contentImages.length === 1 ? [contentImages[0]] : [])
  )
  const [extraInfo, setExtraInfo] = useState('')
  const toggleImage = (url: string) =>
    setSelectedImages(prev => (prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]))
  const [analysis, setAnalysis] = useState<any>(saved.analysis)
  const [tweets, setTweets] = useState<string>(saved.tweets?.raw ?? '')
  const [selectedTweet, setSelectedTweet] = useState<string>(saved.tweets?.raw ?? '')
  const [conceptItems, setConceptItems] = useState<ConceptItem[]>(
    Array.isArray(saved.concepts?.items) ? saved.concepts.items : []
  )
  const [chosenConcept, setChosenConcept] = useState<string>(saved.chosenConcept?.text ?? '')
  const [chosenPreparedPrompt, setChosenPreparedPrompt] = useState<string | undefined>()
  const [imageUrl, setImageUrl] = useState<string>(saved.imageUrl ?? '')
  const [imagePrompt, setImagePrompt] = useState<string>(saved.imagePrompt ?? '')

  const [loadingStep, setLoadingStep] = useState<StepKey | null>(null)
  // التوليد التلقائي المتسلسل لكل الخطوات
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoStage, setAutoStage] = useState('')
  // تضمين تصميم واحد مميّز في «مجلة المبدعين» (تصميم واحد لكل طلب)
  const [featuredCover, setFeaturedCover] = useState<string | null>(null)
  const [featuringCover, setFeaturingCover] = useState<string | null>(null)
  // النشر عبر القنوات (Post-Pulse)
  const [publishingCover, setPublishingCover] = useState<string | null>(null)
  const [publishedCover, setPublishedCover] = useState<string | null>(null)
  // نافذة معاينة/تعديل قبل النشر
  const [publishCover, setPublishCover] = useState<string | null>(null)
  const [publishText, setPublishText] = useState('')

  // يفتح نافذة المعاينة: التصميم + النص القابل للتعديل قبل النشر.
  const openPublish = (cover: string) => {
    setPublishText(selectedTweet || '')
    setPublishCover(cover)
  }

  // ينفّذ النشر الفعلي بالنص المعروض (بعد التعديل) إلى كل القنوات المربوطة.
  const confirmPublish = async () => {
    const cover = publishCover
    if (!cover) return
    if (!publishText.trim()) { showToast('اكتب نص المنشور أولاً', 'error'); return }
    setPublishingCover(cover)
    try {
      const res = await fetch('/api/postpulse/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: publishText,
          imageUrl: cover,
          requestId: request.id,
          postIndex: isPost ? postIndex : undefined,
        }),
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

  const featureInMagazine = async (cover: string) => {
    setFeaturingCover(cover)
    try {
      const res = await fetch('/api/admin/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'request',
          requestId: request.id,
          postIndex: isPost ? postIndex : undefined,
          cover,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'تعذّر التضمين في المجلة', 'error'); return }
      setFeaturedCover(cover) // تصميم واحد مميّز فقط — يستبدل السابق
      showToast('تم تضمين التصميم في مجلة المبدعين ⭐', 'success')
    } catch {
      showToast('حدث خطأ أثناء التضمين', 'error')
    } finally {
      setFeaturingCover(null)
    }
  }

  // توليد الاتجاهات الثلاثة دفعة واحدة + الاختيار منها للإرسال
  // تُعاد تهيئتها من الحالة المحفوظة (saved.designs) فتبقى بعد إعادة التحميل
  const initialDesigns: DesignResult[] = (saved.designs as any[]).map(
    (d, i) => ({ title: d.title ?? `تصميم ${i + 1}`, imageUrl: d.imageUrl ?? d.url ?? '', brief: d.brief ?? '', preparedPrompt: d.preparedPrompt })
  ).filter(d => d.imageUrl)
  const [batchResults, setBatchResults] = useState<DesignResult[]>(initialDesigns)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')
  const designResultsRef = useRef<HTMLDivElement | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<Set<number>>(new Set(initialDesigns.map((_, i) => i)))
  const [lightbox, setLightbox] = useState<string | null>(null)
  // ملاحظات وإعادة توليد التصاميم
  const [noteByIndex, setNoteByIndex] = useState<Record<number, string>>({})
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [singleNote, setSingleNote] = useState('')
  const [regenSingle, setRegenSingle] = useState(false)
  // إعادة توليد كل التصاميم بملاحظة واحدة مشتركة
  const [bulkNote, setBulkNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')

  useEffect(() => {
    if ((autoRunning || batchLoading) && batchResults.length > 0) {
      designResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [autoRunning, batchLoading, batchResults.length])

  const callStep = async (step: StepKey) => {
    setLoadingStep(step)
    try {
      const res = await fetch('/api/admin/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          step,
          sourceImages: selectedImages,
          extraInfo,
          chosenConcept: step === 'image' ? chosenConcept : undefined,
          preparedPrompt: step === 'image' ? chosenPreparedPrompt : undefined,
          postIndex: isPost ? postIndex : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error ?? 'فشل الطلب', 'error')
        return null
      }

      if (step === 'analyze') {
        setAnalysis(data.analysis)
        showToast('تم تحليل الخبر', 'success')
      } else if (step === 'tweets') {
        setTweets(data.tweets)
        setSelectedTweet(data.tweets)
        showToast('تم توليد التغريدات', 'success')
      } else if (step === 'concepts') {
        setConceptItems(Array.isArray(data.concepts) ? data.concepts : [])
        showToast('تم اقتراح الاتجاهات', 'success')
      } else if (step === 'image') {
        setImageUrl(data.imageUrl)
        setImagePrompt(data.prompt)
        // أضِف التصميم المفرد إلى القائمة المحفوظة ليبقى بعد إعادة التحميل
        setBatchResults(prev => {
          const next = [...prev, { title: 'تصميم مفرد', imageUrl: data.imageUrl, brief: chosenConcept, preparedPrompt: chosenPreparedPrompt }]
          persistStudioState({ designs: next })
          return next
        })
        setSelectedBatch(prev => {
          const next = new Set(prev)
          next.add(batchResults.length) // فهرس العنصر المُضاف
          return next
        })
        showToast('تم توليد التصميم', 'success')
      }
      return data
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
      return null
    } finally {
      setLoadingStep(null)
    }
  }

  // يولّد تصميماً واحداً لاتجاه محدّد ويعيد رابط الصورة (يُستخدم في التوليد المجمّع وإعادة التوليد بالملاحظة)
  const generateOneDesign = async (conceptBrief: string, note?: string, preparedPrompt?: string): Promise<string | null> => {
    const res = await fetch('/api/admin/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        step: 'image',
        sourceImages: selectedImages,
        extraInfo,
        chosenConcept: conceptBrief,
        preparedPrompt,
        note: note?.trim() || undefined,
        postIndex: isPost ? postIndex : undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast(data.error ?? 'فشل توليد أحد التصاميم', 'error')
      return null
    }
    return data.imageUrl as string
  }

  // ⚡ التوليد التلقائي: ينفّذ الخطوات تباعاً (تحليل → تغريدات → اتجاهات → تصميم كل الاتجاهات)
  const autoRunAll = async () => {
    if (autoRunning || loadingStep || batchLoading) return
    if (!selectedImages.length) {
      showToast('اختر صورة المصدر أولاً', 'error')
      return
    }
    setAutoRunning(true)
    try {
      // 1) تحليل الخبر
      setAutoStage('١/٤ — تحليل الخبر…')
      if (!(await callStep('analyze'))) return
      // 2) التغريدات
      setAutoStage('٢/٤ — كتابة التغريدات…')
      if (!(await callStep('tweets'))) return
      // 3) اتجاهات التصميم
      setAutoStage('٣/٤ — اقتراح الاتجاهات…')
      const c = await callStep('concepts')
      const concepts: ConceptItem[] = Array.isArray(c?.concepts) ? c.concepts : []
      if (!concepts.length) {
        showToast('لم تُقترح اتجاهات — أعد المحاولة', 'error')
        return
      }
      // 4) توليد تصميم لكل اتجاه
      setBatchResults([])
      setSelectedBatch(new Set())
      const results: DesignResult[] = []
      for (let i = 0; i < concepts.length; i++) {
        setAutoStage(`٤/٤ — توليد التصميم ${i + 1}/${concepts.length}…`)
        const brief = concepts[i].brief ?? concepts[i].title ?? ''
        const url = await generateOneDesign(brief, undefined, concepts[i].imagePrompt)
        if (url) {
          const result = { title: concepts[i].title ?? `اتجاه ${i + 1}`, imageUrl: url, brief, preparedPrompt: concepts[i].imagePrompt }
          results.push(result)
          setBatchResults(prev => {
            const next = [...prev, result]
            persistStudioState({ designs: next })
            return next
          })
          setSelectedBatch(prev => new Set(prev).add(results.length - 1))
        }
      }
      if (results.length) showToast(`اكتمل التوليد التلقائي — ${results.length} تصاميم جاهزة`, 'success')
    } catch {
      showToast('تعذّر إكمال التوليد التلقائي', 'error')
    } finally {
      setAutoRunning(false)
      setAutoStage('')
    }
  }

  // يولّد تصميماً لكل اتجاه من الاتجاهات الثلاثة ثم يعرضها للاختيار
  const designAll = async () => {
    if (!conceptItems.length) return
    if (!selectedImages.length) {
      showToast('اختر صورة المصدر أولاً', 'error')
      return
    }
    setBatchLoading(true)
    setBatchResults([])
    setSelectedBatch(new Set())
    try {
      const results: DesignResult[] = []
      for (let i = 0; i < conceptItems.length; i++) {
        setBatchProgress(`جارٍ توليد ${i + 1}/${conceptItems.length}…`)
        const brief = conceptItems[i].brief ?? conceptItems[i].title ?? ''
        const url = await generateOneDesign(brief, undefined, conceptItems[i].imagePrompt)
        if (url) {
          const result = { title: conceptItems[i].title ?? `اتجاه ${i + 1}`, imageUrl: url, brief, preparedPrompt: conceptItems[i].imagePrompt }
          results.push(result)
          setBatchResults(prev => {
            const next = [...prev, result]
            persistStudioState({ designs: next })
            return next
          })
          setSelectedBatch(prev => new Set(prev).add(results.length - 1))
        }
      }
      setNoteByIndex({})
      if (results.length) showToast(`تم توليد ${results.length} تصاميم`, 'success')
    } catch {
      showToast('حدث خطأ أثناء التوليد المجمّع', 'error')
    } finally {
      setBatchLoading(false)
      setBatchProgress('')
    }
  }

  const toggleBatch = (i: number) => {
    setSelectedBatch(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // إعادة توليد تصميم محدّد من الشبكة بناءً على ملاحظة الأدمن
  const regenerateBatchDesign = async (i: number) => {
    const r = batchResults[i]
    const note = (noteByIndex[i] ?? '').trim()
    if (!r) return
    if (!note) { showToast('اكتب ملاحظة لإعادة التوليد', 'error'); return }
    setRegenIndex(i)
    try {
      const url = await generateOneDesign(r.brief, note, r.preparedPrompt)
      if (url) {
        setBatchResults(prev => {
          const next = prev.map((x, idx) => (idx === i ? { ...x, imageUrl: url } : x))
          persistStudioState({ designs: next }) // حفظ التحديث
          return next
        })
        setSelectedBatch(prev => new Set(prev).add(i)) // اجعله مختاراً تلقائياً
        showToast('تم إعادة توليد التصميم بناءً على ملاحظتك', 'success')
      }
    } finally {
      setRegenIndex(null)
    }
  }

  // تعديل دقيق لتصميم: يطبّق التعديل على نفس التصميم/الصورة (لا يعيد التوليد من معطيات الطلب)
  const editBatchDesign = async (i: number) => {
    const r = batchResults[i]
    const note = (noteByIndex[i] ?? '').trim()
    if (!r) return
    if (!note) { showToast('اكتب التعديل المطلوب', 'error'); return }
    setEditIndex(i)
    try {
      const res = await fetch('/api/admin/ai-studio/edit-design', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: r.imageUrl, note }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'فشل التعديل', 'error'); return }
      setBatchResults(prev => {
        const next = prev.map((x, idx) => (idx === i ? { ...x, imageUrl: d.imageUrl } : x))
        persistStudioState({ designs: next })
        return next
      })
      setSelectedBatch(prev => new Set(prev).add(i))
      showToast('تم التعديل الدقيق على نفس التصميم ✅', 'success')
    } finally {
      setEditIndex(null)
    }
  }

  // إعادة توليد كل التصاميم بملاحظة واحدة مشتركة (حذف/إضافة نص أو تعديل عام)
  const regenerateAllWithNote = async () => {
    if (!batchResults.length) return
    const note = bulkNote.trim()
    if (!note) { showToast('اكتب ملاحظة لإعادة توليد الكل', 'error'); return }
    setBulkBusy(true)
    try {
      const updated = [...batchResults]
      for (let i = 0; i < updated.length; i++) {
        setBulkProgress(`جارٍ إعادة التوليد ${i + 1}/${updated.length}…`)
        const url = await generateOneDesign(updated[i].brief, note, updated[i].preparedPrompt)
        if (url) {
          updated[i] = { ...updated[i], imageUrl: url }
          setBatchResults(prev => prev.map((x, idx) => idx === i ? { ...x, imageUrl: url } : x))
          setSelectedBatch(prev => new Set(prev).add(i))
        }
      }
      persistStudioState({ designs: updated }) // حفظ كل التحديثات
      showToast('تم إعادة توليد كل التصاميم بالملاحظة ✅', 'success')
    } finally {
      setBulkBusy(false); setBulkProgress('')
    }
  }

  // إعادة توليد التصميم المفرد بناءً على ملاحظة
  const regenerateSingle = async () => {
    const note = singleNote.trim()
    if (!note) { showToast('اكتب ملاحظة لإعادة التوليد', 'error'); return }
    if (!chosenConcept.trim()) { showToast('لا يوجد اتجاه معتمد', 'error'); return }
    setRegenSingle(true)
    try {
      const url = await generateOneDesign(chosenConcept, note, chosenPreparedPrompt)
      if (url) { setImageUrl(url); showToast('تم إعادة توليد التصميم بناءً على ملاحظتك', 'success') }
    } finally {
      setRegenSingle(false)
    }
  }

  const cardCls = 'bg-card rounded-2xl border border-border p-5 space-y-3 shadow-sm'

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-lg font-black text-dark">🤖 استوديو الذكاء الاصطناعي</h3>
        {isPost && (
          <span className="text-xs bg-green/10 text-green-700 font-bold px-2 py-0.5 rounded-full">
            منشور {(postIndex as number) + 1}
            {postTitle ? ` — ${postTitle}` : ''}
          </span>
        )}
      </div>

      {/* ── اختيار صور المصدر (يمكن اختيار أكثر من صورة) ── */}
      <div className={cardCls}>
        <h4 className="font-bold text-dark">اختيار صور المصدر</h4>
        {contentImages.length === 0 ? (
          <p className="text-sm text-muted">
            لا توجد صورة مرفقة بالخبر. ارفع صورة المصدر أدناه، أو حلّل الخبر بدونها.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">اختر صورة أو أكثر لتُضمَّن جميعها في التصميم ويُبنى عليها التحليل والاتجاهات:</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {contentImages.map((url) => {
                const on = selectedImages.includes(url)
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => toggleImage(url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      on ? 'border-green ring-2 ring-green/30' : 'border-border'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="صورة" className="w-full h-full object-cover" />
                    {on && (
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-green text-white text-xs flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {selectedImages.length > 0 && (
              <p className="text-[11px] text-green-700">عدد الصور المحددة: {selectedImages.length}</p>
            )}
          </>
        )}

        {/* رفع صورة مصدر من الأدمن */}
        <label className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-sm text-muted hover:border-green hover:text-green cursor-pointer transition-colors">
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? 'جارٍ الرفع...' : '⬆️ رفع صورة مصدر'}
        </label>

        {/* معلومات إضافية قبل التحليل */}
        <div className="pt-1">
          <label className="block text-xs font-medium text-dark mb-1">معلومات إضافية (اختياري):</label>
          <textarea
            value={extraInfo}
            onChange={(e) => setExtraInfo(e.target.value)}
            placeholder="أضِف أي معلومات تُراعى في التحليل والاتجاهات والتصميم (سياق، أسماء، تفاصيل غير موجودة بالخبر...)"
            className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[70px] resize-y"
          />
        </div>
      </div>

      {/* ── ⚡ التوليد التلقائي لكل الخطوات ── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="font-bold text-dark">⚡ توليد تلقائي لكل الخطوات</h4>
            <p className="text-xs text-muted mt-0.5">
              ينفّذ الخطوات تباعاً: تحليل ← تغريدات ← اتجاهات ← تصميم كل الاتجاهات.
            </p>
          </div>
          <Button
            onClick={autoRunAll}
            loading={autoRunning}
            disabled={autoRunning || loadingStep !== null || batchLoading || !selectedImages.length}
            size="sm"
          >
            ⚡ توليد تلقائي
          </Button>
        </div>
        {autoRunning && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <LoadingSpinner size="sm" />
            <span>{autoStage || 'جارٍ التنفيذ…'}</span>
          </div>
        )}
        {!selectedImages.length && (
          <p className="text-[11px] text-amber-600">اختر صورة المصدر أولاً لتفعيل التوليد التلقائي.</p>
        )}
      </div>

      {/* ── الخطوة 1 — تحليل الخبر ── */}
      <div className={cardCls}>
        <StepHead n={1} title="تحليل الخبر" subtitle="استخراج عناصر الخبر لبناء المحتوى" done={!!analysis} />
        <Button
          onClick={() => callStep('analyze')}
          loading={loadingStep === 'analyze'}
          disabled={loadingStep !== null}
          size="sm"
        >
          حلّل الخبر
        </Button>
        {analysis && (
          <pre
            dir="rtl"
            className="bg-cream rounded-xl p-3 text-xs text-dark whitespace-pre-wrap max-h-72 overflow-y-auto border border-border"
          >
            {JSON.stringify(analysis, null, 2)}
          </pre>
        )}
      </div>

      {/* ── الخطوة 2 — التغريدات ── */}
      <div className={cardCls}>
        <StepHead n={2} title="التغريدات" subtitle="٣ تغريدات بزوايا ومطالع متنوّعة" done={!!tweets} />
        <Button
          onClick={() => callStep('tweets')}
          loading={loadingStep === 'tweets'}
          disabled={loadingStep !== null || !analysis}
          size="sm"
        >
          اكتب 3 تغريدات
        </Button>
        {tweets && (
          <div className="space-y-2">
            <pre
              dir="rtl"
              className="bg-cream rounded-xl p-3 text-xs text-dark whitespace-pre-wrap max-h-60 overflow-y-auto border border-border"
            >
              {tweets}
            </pre>
            <label className="block text-xs font-medium text-dark">
              التغريدة المختارة (عدّلها قبل الإرسال):
            </label>
            <textarea
              value={selectedTweet}
              onChange={(e) => setSelectedTweet(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[90px] resize-y"
            />
          </div>
        )}
      </div>

      {/* ── الخطوة 3 — اتجاهات التصميم ── */}
      <div className={cardCls}>
        <StepHead n={3} title="اتجاهات التصميم" subtitle="٣ اتجاهات مختلفة بناءً على الخبر والصورة" done={conceptItems.length > 0} />
        <Button
          onClick={() => callStep('concepts')}
          loading={loadingStep === 'concepts'}
          disabled={loadingStep !== null || !analysis}
          size="sm"
        >
          اقترح 3 اتجاهات
        </Button>
        {conceptItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {conceptItems.map((c, i) => {
              const brief = c.brief ?? c.title ?? ''
              const isChosen = chosenConcept === brief
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-3 text-xs space-y-1 transition-all ${
                    isChosen ? 'border-green ring-2 ring-green/30 bg-green/5' : 'border-border bg-cream'
                  }`}
                >
                  <div className="font-bold text-dark">{c.title ?? `اتجاه ${i + 1}`}</div>
                  {c.mood && <div className="text-[11px] text-green-700">{c.mood}</div>}
                  <p className="text-[11px] text-muted whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {brief}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setChosenConcept(brief); setChosenPreparedPrompt(c.imagePrompt) }}
                    className={`mt-1 w-full rounded-lg py-1 text-[11px] font-bold transition-colors ${
                      isChosen ? 'bg-green text-white' : 'bg-white border border-border text-dark hover:border-green'
                    }`}
                  >
                    {isChosen ? '✓ معتمد للمفرد' : 'اعتمد للمفرد'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <label className="block text-xs font-medium text-dark">
          الاتجاه المعتمد (للتصميم المفرد — عدّله إن شئت):
        </label>
        <textarea
          value={chosenConcept}
          onChange={(e) => { setChosenConcept(e.target.value); setChosenPreparedPrompt(undefined) }}
          placeholder="اضغط «اعتمد للمفرد» على أحد الاتجاهات أعلاه، أو اكتب اتجاهاً يدوياً."
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[80px] resize-y"
        />
      </div>

      {/* ── الخطوة 4 — توليد التصميم ── */}
      <div className={cardCls}>
        <StepHead n={4} title="توليد التصميم" subtitle="صمّم الاتجاهات الثلاثة أو الاتجاه المعتمد" done={batchResults.length > 0 || !!imageUrl} />

        {/* توليد الاتجاهات الثلاثة دفعة واحدة */}
        <div className="space-y-2">
          <Button
            onClick={designAll}
            loading={batchLoading}
            disabled={batchLoading || loadingStep !== null || !analysis || !selectedImages.length || conceptItems.length === 0}
            size="sm"
          >
            🎨 صمّم الاتجاهات الثلاثة
          </Button>
          {batchLoading && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <LoadingSpinner size="sm" />
              <span>{batchProgress || 'جارٍ التوليد المجمّع…'}</span>
            </div>
          )}
          {autoRunning && autoStage.includes('توليد التصميم') && (
            <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm font-bold text-teal-900">
              <LoadingSpinner size="sm" />
              <span>{autoStage}</span>
            </div>
          )}
          {batchResults.length > 0 && (
            <div ref={designResultsRef} className="space-y-3">
              <p className="text-xs text-muted">اختر التصاميم لإرسالها للعميل، أو اكتب ملاحظة وأعد توليد أي تصميم:</p>
              {/* إعادة توليد كل التصاميم بملاحظة واحدة (حذف نص/إضافة نص/تعديل عام) */}
              <div className="rounded-xl border border-green/40 bg-green/5 p-3 space-y-2">
                <p className="text-[11px] text-muted">✍️ ملاحظة تُطبَّق على كل التصاميم معاً — مثل: احذف نص «كذا»، أضِف «كذا»، أو تعديل عام على التصميم.</p>
                <textarea value={bulkNote} onChange={e => setBulkNote(e.target.value)} disabled={bulkBusy}
                  placeholder="اكتب ملاحظة لإعادة توليد كل التصاميم..." className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[60px] resize-y" />
                <div className="flex items-center gap-2">
                  <Button onClick={regenerateAllWithNote} loading={bulkBusy} disabled={bulkBusy || regenIndex !== null || batchLoading || !bulkNote.trim()} size="sm">
                    🔁 أعد توليد الكل بالملاحظة
                  </Button>
                  {bulkBusy && <span className="text-xs text-green-700 flex items-center gap-1.5"><LoadingSpinner size="sm" />{bulkProgress}</span>}
                </div>
              </div>
              <div className="space-y-3">
                {batchResults.map((r, i) => {
                  const on = selectedBatch.has(i)
                  const regenerating = regenIndex === i
                  return (
                    <div key={i} className={`rounded-xl border-2 p-2 transition-all ${on ? 'border-green bg-green/5' : 'border-border'}`}>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => toggleBatch(i)}
                          className="relative w-24 flex-shrink-0 rounded-lg overflow-hidden border border-border"
                          title={on ? 'مختار للإرسال' : 'اضغط للاختيار'}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.imageUrl} alt={r.title} className="w-full aspect-[4/5] object-cover" />
                          {on && (
                            <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-green text-white text-xs flex items-center justify-center">✓</span>
                          )}
                          {regenerating && (
                            <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><LoadingSpinner size="sm" /></span>
                          )}
                        </button>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-dark text-xs truncate">{r.title}</span>
                            <button type="button" onClick={() => setLightbox(r.imageUrl)} className="text-[11px] text-green hover:underline">⛶ تكبير</button>
                          </div>
                          <textarea
                            value={noteByIndex[i] ?? ''}
                            onChange={e => setNoteByIndex(prev => ({ ...prev, [i]: e.target.value }))}
                            placeholder="التعديل المطلوب (مثال: احذف كلمة «كذا»، أضِف «كذا»، كبّر الاسم، اجعل الخلفية أغمق...)"
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs min-h-[52px] resize-y"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => editBatchDesign(i)}
                              loading={editIndex === i}
                              disabled={editIndex !== null || regenIndex !== null || batchLoading || !(noteByIndex[i] ?? '').trim()}
                              size="sm"
                            >
                              ✂️ تعديل دقيق (نفس التصميم)
                            </Button>
                            <Button
                              onClick={() => regenerateBatchDesign(i)}
                              loading={regenerating}
                              disabled={regenIndex !== null || editIndex !== null || batchLoading || !(noteByIndex[i] ?? '').trim()}
                              variant="outline"
                              size="sm"
                            >
                              🔄 إعادة توليد (تصميم جديد)
                            </Button>
                            <Button
                              onClick={() => featureInMagazine(r.imageUrl)}
                              loading={featuringCover === r.imageUrl}
                              disabled={featuringCover !== null}
                              variant={featuredCover === r.imageUrl ? 'secondary' : 'outline'}
                              size="sm"
                            >
                              {featuredCover === r.imageUrl ? '⭐ مميّز في المجلة' : '⭐ ضمّن في المجلة'}
                            </Button>
                            <Button
                              onClick={() => openPublish(r.imageUrl)}
                              loading={publishingCover === r.imageUrl}
                              disabled={publishingCover !== null}
                              variant={publishedCover === r.imageUrl ? 'secondary' : 'outline'}
                              size="sm"
                            >
                              {publishedCover === r.imageUrl ? '✅ نُشر' : '📣 انشر عبر القنوات'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button
                onClick={() => {
                  const urls = batchResults.filter((_, i) => selectedBatch.has(i)).map(r => r.imageUrl)
                  if (!urls.length) { showToast('اختر تصميماً واحداً على الأقل', 'error'); return }
                  onUsedContent(selectedTweet, urls, isPost ? (postIndex as number) : 0)
                }}
                variant="secondary"
                size="sm"
              >
                إرسال التصاميم المختارة ({selectedBatch.size}) والتغريدة للعميل
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs text-muted">أو صمّم الاتجاه المعتمد فقط (تصميم واحد):</p>
          <Button
            onClick={() => callStep('image')}
            loading={loadingStep === 'image'}
            disabled={
              loadingStep !== null || batchLoading || !analysis || !selectedImages.length || !chosenConcept.trim()
            }
            variant="outline"
            size="sm"
          >
            صمّم الصورة (مفرد)
          </Button>
          {loadingStep === 'image' && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <LoadingSpinner size="sm" />
              <span>جارٍ توليد التصميم… قد يستغرق دقيقة</span>
            </div>
          )}
          {imageUrl && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="التصميم المولّد"
                onClick={() => setLightbox(imageUrl)}
                className="max-w-xs rounded-xl border border-border cursor-zoom-in"
                title="اضغط للتكبير"
              />
              {imagePrompt && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">عرض البرومبت المستخدم</summary>
                  <pre
                    dir="rtl"
                    className="bg-cream rounded-xl p-3 mt-2 whitespace-pre-wrap max-h-60 overflow-y-auto border border-border"
                  >
                    {imagePrompt}
                  </pre>
                </details>
              )}
              {/* ملاحظة وإعادة توليد التصميم المفرد */}
              <div className="bg-cream/60 rounded-xl p-2 space-y-1.5">
                <textarea
                  value={singleNote}
                  onChange={e => setSingleNote(e.target.value)}
                  placeholder="ملاحظة لإعادة توليد هذا التصميم (مثال: اجعل الخلفية أغمق، كبّر الاسم...)"
                  className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs min-h-[52px] resize-y"
                />
                <Button
                  onClick={regenerateSingle}
                  loading={regenSingle}
                  disabled={regenSingle || loadingStep !== null || !singleNote.trim()}
                  variant="outline"
                  size="sm"
                >
                  🔄 إعادة التوليد بالملاحظة
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => onUsedContent(selectedTweet, [imageUrl], isPost ? (postIndex as number) : 0)}
                  variant="secondary"
                  size="sm"
                >
                  استخدم هذا التصميم والتغريدة
                </Button>
                <Button
                  onClick={() => featureInMagazine(imageUrl)}
                  loading={featuringCover === imageUrl}
                  disabled={featuringCover !== null}
                  variant={featuredCover === imageUrl ? 'secondary' : 'outline'}
                  size="sm"
                >
                  {featuredCover === imageUrl ? '⭐ مميّز في المجلة' : '⭐ ضمّن في المجلة'}
                </Button>
                <Button
                  onClick={() => openPublish(imageUrl)}
                  loading={publishingCover === imageUrl}
                  disabled={publishingCover !== null}
                  variant={publishedCover === imageUrl ? 'secondary' : 'outline'}
                  size="sm"
                >
                  {publishedCover === imageUrl ? '✅ نُشر' : '📣 انشر عبر القنوات'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── التصاميم المعدّلة تلقائياً حسب ملاحظات العميل (مع الإبقاء على القديمة أعلاه) ── */}
      {Array.isArray(saved.revised?.designs) && saved.revised.designs.length > 0 && (
        <div className={`${cardCls} border-amber-300`}>
          <StepHead n="🔁" title="التصاميم المعدّلة (حسب ملاحظات العميل)" subtitle="أُعيد توليدها آلياً — راجعها وأرسل الأنسب؛ التصاميم القديمة محفوظة أعلاه" tone="gold" />
          {saved.revised.feedback && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <span className="font-bold">✍️ ملاحظة العميل:</span> {saved.revised.feedback}
            </div>
          )}
          <div className="space-y-3">
            {saved.revised.designs.map((d: { title?: string; imageUrl?: string }, i: number) => {
              const url = d.imageUrl as string
              return (
                <div key={i} className="rounded-xl border-2 border-amber-200 p-2 flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={d.title} onClick={() => setLightbox(url)} className="w-24 flex-shrink-0 aspect-[4/5] object-cover rounded-lg border border-border cursor-zoom-in" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="font-bold text-dark text-xs">{d.title ?? `معدّل ${i + 1}`}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => onUsedContent(selectedTweet, [url], isPost ? (postIndex as number) : 0)} variant="secondary" size="sm">📤 أرسل هذا للعميل</Button>
                      <Button onClick={() => openPublish(url)} loading={publishingCover === url} disabled={publishingCover !== null} variant={publishedCover === url ? 'secondary' : 'outline'} size="sm">
                        {publishedCover === url ? '✅ نُشر' : '📣 انشر'}
                      </Button>
                      <Button onClick={() => featureInMagazine(url)} loading={featuringCover === url} disabled={featuringCover !== null} variant={featuredCover === url ? 'secondary' : 'outline'} size="sm">
                        {featuredCover === url ? '⭐ مميّز' : '⭐ ضمّن'}
                      </Button>
                      <a href={url} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-green/10 text-green hover:bg-green/20">⬇️ تنزيل</a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />

      {/* نافذة معاينة/تعديل قبل النشر عبر القنوات */}
      {publishCover && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => publishingCover ? null : setPublishCover(null)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-black text-dark text-base">📣 النشر عبر القنوات</h3>
              <p className="text-xs text-muted mt-0.5">سيُنشر النص أدناه مع التصميم في <b>كل القنوات المربوطة</b> في Post‑Pulse فوراً.</p>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publishCover} alt="التصميم" className="w-32 mx-auto aspect-[4/5] object-cover rounded-xl border border-border" />
              <div>
                <label className="block text-xs font-bold text-dark mb-1">نص المنشور (عدّله قبل النشر):</label>
                <textarea
                  value={publishText}
                  onChange={e => setPublishText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[140px] resize-y"
                  placeholder="اكتب نص المنشور..."
                />
                <p className="text-[11px] text-muted mt-1">{publishText.length} حرف</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2">
              <Button onClick={confirmPublish} loading={publishingCover === publishCover} disabled={!!publishingCover || !publishText.trim()} className="flex-1">
                🚀 انشر الآن
              </Button>
              <Button variant="outline" onClick={() => setPublishCover(null)} disabled={!!publishingCover}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
