'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface Props {
  request: any
  onUsedContent: (text: string, imageUrl: string) => void
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
  const [concepts, setConcepts] = useState<string>(saved.concepts?.raw ?? '')
  const [chosenConcept, setChosenConcept] = useState<string>(saved.chosenConcept?.text ?? '')
  const [imageUrl, setImageUrl] = useState<string>(saved.imageUrl ?? '')
  const [imagePrompt, setImagePrompt] = useState<string>(saved.imagePrompt ?? '')

  const [loadingStep, setLoadingStep] = useState<StepKey | null>(null)

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
        setConcepts(data.concepts)
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
        <Button
          onClick={() => callStep('concepts')}
          loading={loadingStep === 'concepts'}
          disabled={loadingStep !== null || !analysis}
          size="sm"
        >
          اقترح 3 اتجاهات
        </Button>
        {concepts && (
          <pre
            dir="rtl"
            className="bg-cream rounded-xl p-3 text-xs text-dark whitespace-pre-wrap max-h-60 overflow-y-auto border border-border"
          >
            {concepts}
          </pre>
        )}
        <label className="block text-xs font-medium text-dark">
          الاتجاه المعتمد (الصق نص الاتجاه الذي تريد اعتماده):
        </label>
        <textarea
          value={chosenConcept}
          onChange={(e) => setChosenConcept(e.target.value)}
          placeholder="مثال: الاتجاه 1 — سينمائي هيرو ..."
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[80px] resize-y"
        />
      </div>

      {/* ── الخطوة 4 — توليد التصميم ── */}
      <div className={cardCls}>
        <h4 className="font-bold text-dark">الخطوة 4 — توليد التصميم</h4>
        <Button
          onClick={() => callStep('image')}
          loading={loadingStep === 'image'}
          disabled={
            loadingStep !== null || !analysis || !selectedImage || !chosenConcept.trim()
          }
          size="sm"
        >
          صمّم الصورة
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
              className="max-w-xs rounded-xl border border-border"
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
            <Button
              onClick={() => onUsedContent(selectedTweet, imageUrl)}
              variant="secondary"
              size="sm"
            >
              استخدم هذا التصميم والتغريدة
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
