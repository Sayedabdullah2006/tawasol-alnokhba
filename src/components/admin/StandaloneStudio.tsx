'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageLightbox from '@/components/ui/ImageLightbox'

type StepKey = 'analyze' | 'tweets' | 'concepts' | 'image'
interface ConceptItem { title?: string; mood?: string; brief?: string }

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
  const [uploading, setUploading] = useState(false)

  const toggleImage = (url: string) =>
    setSelectedImages(prev => (prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]))

  const [analysis, setAnalysis] = useState<any>(null)
  const [tweets, setTweets] = useState('')
  const [selectedTweet, setSelectedTweet] = useState('')
  const [conceptItems, setConceptItems] = useState<ConceptItem[]>([])
  const [chosenConcept, setChosenConcept] = useState('')
  const [loadingStep, setLoadingStep] = useState<StepKey | null>(null)

  const [batchResults, setBatchResults] = useState<{ title: string; imageUrl: string; brief: string }[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')
  const [noteByIndex, setNoteByIndex] = useState<Record<number, string>>({})
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

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
      const ext = file.name.split('.').pop()
      const path = `studio-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
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

  const post = async (payload: any) => {
    const res = await fetch('/api/admin/ai-studio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { showToast(data.error ?? 'فشل الطلب', 'error'); return null }
    return data
  }

  const callStep = async (step: StepKey) => {
    if (!content.trim()) { showToast('أدخل نص الخبر أولاً', 'error'); return }
    setLoadingStep(step)
    try {
      const data = await post({
        step, title, content, sourceImages: selectedImages, extraInfo, analysis,
        chosenConcept: step === 'image' ? chosenConcept : undefined,
        hasVideo,
        // عند إعادة اقتراح الاتجاهات: استبعد الحالية لتأتي بدائل مختلفة
        previousConcepts: step === 'concepts' ? conceptItems.map(c => c.title ?? '').filter(Boolean) : undefined,
      })
      if (!data) return
      if (step === 'analyze') { setAnalysis(data.analysis); showToast('تم التحليل', 'success') }
      else if (step === 'tweets') { setTweets(data.tweets); setSelectedTweet(data.tweets); showToast('تم توليد التغريدات', 'success') }
      else if (step === 'concepts') { setConceptItems(Array.isArray(data.concepts) ? data.concepts : []); showToast('تم اقتراح الاتجاهات', 'success') }
      else if (step === 'image') {
        setBatchResults(prev => [...prev, { title: 'تصميم مفرد', imageUrl: data.imageUrl, brief: chosenConcept }])
        showToast('تم توليد التصميم', 'success')
      }
    } finally { setLoadingStep(null) }
  }

  const genOne = async (brief: string, note?: string): Promise<string | null> => {
    const data = await post({ step: 'image', title, content, sourceImages: selectedImages, extraInfo, analysis, chosenConcept: brief, note, hasVideo })
    return data?.imageUrl ?? null
  }

  const designAll = async () => {
    if (!conceptItems.length) return
    if (!selectedImages.length) { showToast('ارفع صورة المصدر أولاً', 'error'); return }
    setBatchLoading(true); setBatchResults([]); setNoteByIndex({})
    try {
      const results: { title: string; imageUrl: string; brief: string }[] = []
      for (let i = 0; i < conceptItems.length; i++) {
        setBatchProgress(`جارٍ توليد ${i + 1}/${conceptItems.length}…`)
        const brief = conceptItems[i].brief ?? conceptItems[i].title ?? ''
        const url = await genOne(brief)
        if (url) results.push({ title: conceptItems[i].title ?? `اتجاه ${i + 1}`, imageUrl: url, brief })
      }
      setBatchResults(results)
      if (results.length) showToast(`تم توليد ${results.length} تصاميم`, 'success')
    } finally { setBatchLoading(false); setBatchProgress('') }
  }

  const regenerate = async (i: number) => {
    const r = batchResults[i]; const note = (noteByIndex[i] ?? '').trim()
    if (!r || !note) { showToast('اكتب ملاحظة لإعادة التوليد', 'error'); return }
    setRegenIndex(i)
    try {
      const url = await genOne(r.brief, note)
      if (url) { setBatchResults(prev => prev.map((x, idx) => idx === i ? { ...x, imageUrl: url } : x)); showToast('تم إعادة التوليد', 'success') }
    } finally { setRegenIndex(null) }
  }

  const card = 'bg-card rounded-2xl border border-border p-5 space-y-3'

  return (
    <div className="space-y-4" dir="rtl">
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
            <span className="block text-[11px] text-muted mt-0.5">يولّد التصميم بمساحة فيديو عريضة فارغة (تضيف الفيديو لاحقاً) + صورة الشخص في إطار احترافي.</span>
          </span>
        </label>
      </div>

      {/* 1 تحليل */}
      <div className={card}>
        <h4 className="font-bold text-dark">الخطوة 1 — تحليل الخبر</h4>
        <Button onClick={() => callStep('analyze')} loading={loadingStep === 'analyze'} disabled={loadingStep !== null || !content.trim()} size="sm">حلّل الخبر</Button>
        {analysis && <pre dir="rtl" className="bg-cream rounded-xl p-3 text-xs whitespace-pre-wrap max-h-72 overflow-y-auto border border-border">{JSON.stringify(analysis, null, 2)}</pre>}
      </div>

      {/* 2 تغريدات */}
      <div className={card}>
        <h4 className="font-bold text-dark">الخطوة 2 — التغريدات</h4>
        <Button onClick={() => callStep('tweets')} loading={loadingStep === 'tweets'} disabled={loadingStep !== null || !analysis} size="sm">اكتب 3 تغريدات</Button>
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
        <h4 className="font-bold text-dark">الخطوة 3 — اتجاهات التصميم</h4>
        <Button onClick={() => callStep('concepts')} loading={loadingStep === 'concepts'} disabled={loadingStep !== null || !analysis} size="sm">اقترح 3 اتجاهات</Button>
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
                  <button type="button" onClick={() => setChosenConcept(brief)}
                    className={`mt-1 w-full rounded-lg py-1 text-[11px] font-bold ${on ? 'bg-green text-white' : 'bg-white border border-border text-dark hover:border-green'}`}>
                    {on ? '✓ معتمد' : 'اعتمد'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <textarea value={chosenConcept} onChange={e => setChosenConcept(e.target.value)} placeholder="الاتجاه المعتمد (اعتمد أحد الاتجاهات أو اكتب يدوياً)"
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[70px] resize-y" />
      </div>

      {/* 4 تصاميم */}
      <div className={card}>
        <h4 className="font-bold text-dark">الخطوة 4 — التصاميم</h4>
        <Button onClick={designAll} loading={batchLoading} disabled={batchLoading || loadingStep !== null || !analysis || !selectedImages.length || conceptItems.length === 0} size="sm">🎨 صمّم الاتجاهات الثلاثة</Button>
        {batchLoading && <div className="flex items-center gap-2 text-sm text-muted"><LoadingSpinner size="sm" /><span>{batchProgress || 'جارٍ التوليد…'}</span></div>}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted mb-2">أو صمّم الاتجاه المعتمد (تصميم واحد):</p>
          <Button onClick={() => callStep('image')} loading={loadingStep === 'image'} disabled={loadingStep !== null || batchLoading || !analysis || !selectedImages.length || !chosenConcept.trim()} variant="outline" size="sm">صمّم الصورة (مفرد)</Button>
        </div>

        {batchResults.length > 0 && (
          <div className="space-y-3 pt-2">
            {batchResults.map((r, i) => (
              <div key={i} className="rounded-xl border border-border p-2 flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.imageUrl} alt={r.title} onClick={() => setLightbox(r.imageUrl)} className="w-24 flex-shrink-0 aspect-[4/5] object-cover rounded-lg border border-border cursor-zoom-in" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="font-bold text-dark text-xs">{r.title}</div>
                  <textarea value={noteByIndex[i] ?? ''} onChange={e => setNoteByIndex(p => ({ ...p, [i]: e.target.value }))}
                    placeholder="ملاحظة لإعادة التوليد..." className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs min-h-[48px] resize-y" />
                  <div className="flex gap-2">
                    <Button onClick={() => regenerate(i)} loading={regenIndex === i} disabled={regenIndex !== null || !(noteByIndex[i] ?? '').trim()} variant="outline" size="sm">🔄 إعادة التوليد</Button>
                    <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" download
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-green/10 text-green hover:bg-green/20">⬇️ تنزيل</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
