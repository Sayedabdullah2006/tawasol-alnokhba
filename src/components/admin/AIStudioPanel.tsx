'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageLightbox from '@/components/ui/ImageLightbox'

interface ConceptItem {
  title?: string
  mood?: string
  brief?: string
}

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
        imageUrl: savedStudio?.image_url ?? '',
      }
    : {
        analysis: request.ai_analysis ?? null,
        tweets: request.ai_tweets ?? null,
        concepts: request.ai_design_concepts ?? null,
        chosenConcept: request.ai_chosen_concept ?? null,
        imagePrompt: request.ai_image_prompt ?? '',
        sourceImage: request.ai_source_image ?? null,
        imageUrl: '',
      }

  // صور المصدر: صور هذا المنشور (حملة) أو صور الطلب (مفرد) + أي صور يرفعها الأدمن يدوياً
  const initialContentImages: string[] = isPost
    ? (Array.isArray(postImages) ? postImages : [])
    : (Array.isArray(request.content_images) ? request.content_images : [])
  const [contentImages, setContentImages] = useState<string[]>(initialContentImages)
  const [uploading, setUploading] = useState(false)

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
      setContentImages(prev => [...prev, data.publicUrl])
      setSelectedImage(data.publicUrl)
      showToast('تم رفع الصورة', 'success')
    } catch {
      showToast('فشل رفع الصورة', 'error')
    } finally {
      setUploading(false)
    }
  }

  // ── State (prefilled from saved studio state when re-opened) ──
  const [selectedImage, setSelectedImage] = useState<string | null>(
    saved.sourceImage ?? (contentImages.length === 1 ? contentImages[0] : null)
  )
  const [analysis, setAnalysis] = useState<any>(saved.analysis)
  const [tweets, setTweets] = useState<string>(saved.tweets?.raw ?? '')
  const [selectedTweet, setSelectedTweet] = useState<string>(saved.tweets?.raw ?? '')
  const [conceptItems, setConceptItems] = useState<ConceptItem[]>(
    Array.isArray(saved.concepts?.items) ? saved.concepts.items : []
  )
  const [chosenConcept, setChosenConcept] = useState<string>(saved.chosenConcept?.text ?? '')
  const [imageUrl, setImageUrl] = useState<string>(saved.imageUrl ?? '')
  const [imagePrompt, setImagePrompt] = useState<string>(saved.imagePrompt ?? '')

  const [loadingStep, setLoadingStep] = useState<StepKey | null>(null)

  // توليد الاتجاهات الثلاثة دفعة واحدة + الاختيار منها للإرسال
  const [batchResults, setBatchResults] = useState<{ title: string; imageUrl: string; brief: string }[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')
  const [selectedBatch, setSelectedBatch] = useState<Set<number>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)
  // ملاحظات وإعادة توليد التصاميم
  const [noteByIndex, setNoteByIndex] = useState<Record<number, string>>({})
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [singleNote, setSingleNote] = useState('')
  const [regenSingle, setRegenSingle] = useState(false)

  const callStep = async (step: StepKey) => {
    setLoadingStep(step)
    try {
      const res = await fetch('/api/admin/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          step,
          sourceImage: selectedImage ?? undefined,
          chosenConcept: step === 'image' ? chosenConcept : undefined,
          postIndex: isPost ? postIndex : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error ?? 'فشل الطلب', 'error')
        return
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
        showToast('تم توليد التصميم', 'success')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setLoadingStep(null)
    }
  }

  // يولّد تصميماً واحداً لاتجاه محدّد ويعيد رابط الصورة (يُستخدم في التوليد المجمّع وإعادة التوليد بالملاحظة)
  const generateOneDesign = async (conceptBrief: string, note?: string): Promise<string | null> => {
    const res = await fetch('/api/admin/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        step: 'image',
        sourceImage: selectedImage ?? undefined,
        chosenConcept: conceptBrief,
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

  // يولّد تصميماً لكل اتجاه من الاتجاهات الثلاثة ثم يعرضها للاختيار
  const designAll = async () => {
    if (!conceptItems.length) return
    if (!selectedImage) {
      showToast('اختر صورة المصدر أولاً', 'error')
      return
    }
    setBatchLoading(true)
    setBatchResults([])
    setSelectedBatch(new Set())
    try {
      const results: { title: string; imageUrl: string; brief: string }[] = []
      for (let i = 0; i < conceptItems.length; i++) {
        setBatchProgress(`جارٍ توليد ${i + 1}/${conceptItems.length}…`)
        const brief = conceptItems[i].brief ?? conceptItems[i].title ?? ''
        const url = await generateOneDesign(brief)
        if (url) results.push({ title: conceptItems[i].title ?? `اتجاه ${i + 1}`, imageUrl: url, brief })
      }
      setBatchResults(results)
      setNoteByIndex({})
      // كل التصاميم مختارة افتراضياً للإرسال للعميل
      setSelectedBatch(new Set(results.map((_, i) => i)))
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
      const url = await generateOneDesign(r.brief, note)
      if (url) {
        setBatchResults(prev => prev.map((x, idx) => (idx === i ? { ...x, imageUrl: url } : x)))
        setSelectedBatch(prev => new Set(prev).add(i)) // اجعله مختاراً تلقائياً
        showToast('تم إعادة توليد التصميم بناءً على ملاحظتك', 'success')
      }
    } finally {
      setRegenIndex(null)
    }
  }

  // إعادة توليد التصميم المفرد بناءً على ملاحظة
  const regenerateSingle = async () => {
    const note = singleNote.trim()
    if (!note) { showToast('اكتب ملاحظة لإعادة التوليد', 'error'); return }
    if (!chosenConcept.trim()) { showToast('لا يوجد اتجاه معتمد', 'error'); return }
    setRegenSingle(true)
    try {
      const url = await generateOneDesign(chosenConcept, note)
      if (url) { setImageUrl(url); showToast('تم إعادة توليد التصميم بناءً على ملاحظتك', 'success') }
    } finally {
      setRegenSingle(false)
    }
  }

  const cardCls = 'bg-card rounded-2xl border border-border p-5 space-y-3'

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

      {/* ── اختيار صورة المصدر ── */}
      <div className={cardCls}>
        <h4 className="font-bold text-dark">اختيار صورة المصدر</h4>
        {contentImages.length === 0 ? (
          <p className="text-sm text-muted">
            لا توجد صورة مرفقة بالخبر. ارفع صورة المصدر أدناه، أو حلّل الخبر بدونها.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {contentImages.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => setSelectedImage(url)}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                  selectedImage === url ? 'border-green ring-2 ring-green/30' : 'border-border'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="صورة" className="w-full h-full object-cover" />
                {selectedImage === url && (
                  <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-green text-white text-xs flex items-center justify-center">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
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
      </div>

      {/* ── الخطوة 1 — تحليل الخبر ── */}
      <div className={cardCls}>
        <h4 className="font-bold text-dark">الخطوة 1 — تحليل الخبر</h4>
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
        <h4 className="font-bold text-dark">الخطوة 2 — التغريدات</h4>
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
        <h4 className="font-bold text-dark">الخطوة 3 — اتجاهات التصميم</h4>
        <p className="text-xs text-muted">
          تُولَّد 3 اتجاهات مختلفة بناءً على تحليل الخبر وصورته المختارة.
        </p>
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
                    onClick={() => setChosenConcept(brief)}
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
          onChange={(e) => setChosenConcept(e.target.value)}
          placeholder="اضغط «اعتمد للمفرد» على أحد الاتجاهات أعلاه، أو اكتب اتجاهاً يدوياً."
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[80px] resize-y"
        />
      </div>

      {/* ── الخطوة 4 — توليد التصميم ── */}
      <div className={cardCls}>
        <h4 className="font-bold text-dark">الخطوة 4 — توليد التصميم</h4>

        {/* توليد الاتجاهات الثلاثة دفعة واحدة */}
        <div className="space-y-2">
          <Button
            onClick={designAll}
            loading={batchLoading}
            disabled={batchLoading || loadingStep !== null || !analysis || !selectedImage || conceptItems.length === 0}
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
          {batchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted">اختر التصاميم لإرسالها للعميل، أو اكتب ملاحظة وأعد توليد أي تصميم:</p>
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
                            placeholder="ملاحظة لإعادة التوليد (مثال: اجعل الخلفية أغمق، كبّر الاسم، خفّف الزخارف...)"
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs min-h-[52px] resize-y"
                          />
                          <Button
                            onClick={() => regenerateBatchDesign(i)}
                            loading={regenerating}
                            disabled={regenIndex !== null || batchLoading || !(noteByIndex[i] ?? '').trim()}
                            variant="outline"
                            size="sm"
                          >
                            🔄 إعادة التوليد بالملاحظة
                          </Button>
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
              loadingStep !== null || batchLoading || !analysis || !selectedImage || !chosenConcept.trim()
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
              <Button
                onClick={() => onUsedContent(selectedTweet, [imageUrl], isPost ? (postIndex as number) : 0)}
                variant="secondary"
                size="sm"
              >
                استخدم هذا التصميم والتغريدة
              </Button>
            </div>
          )}
        </div>
      </div>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
