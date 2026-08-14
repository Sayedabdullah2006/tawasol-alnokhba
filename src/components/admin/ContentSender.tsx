'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import ContentImagesUploader from '@/components/request/ContentImagesUploader'
import ImageLightbox from '@/components/ui/ImageLightbox'
import type { PublishRequest } from '@/types/publish-request'

interface ContentSenderProps {
  request: PublishRequest
  onSent: () => void
  onCancel: () => void
  initialContent?: string
  initialImages?: string[]
  isRevision?: boolean
  // عند تمريره: يُرسل محتوى خبر واحد (postIndex) عبر مسار المراجعة لكل منشور
  postIndex?: number
  postLabel?: string
}

export default function ContentSender({ request, onSent, onCancel, initialContent, initialImages, isRevision, postIndex, postLabel }: ContentSenderProps) {
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [proposedContent, setProposedContent] = useState(initialContent ?? '')
  const [proposedImages, setProposedImages] = useState<string[]>(initialImages ?? [])
  const [lightbox, setLightbox] = useState<string | null>(null)

  const handleSend = async () => {
    if (!proposedContent.trim()) {
      showToast('يرجى كتابة النص المقترح', 'error')
      return
    }

    console.log('📤 إرسال المحتوى:', {
      requestId: request.id,
      contentLength: proposedContent.trim().length,
      imagesCount: proposedImages.length,
      images: proposedImages
    })

    const perPost = typeof postIndex === 'number'
    setLoading(true)
    try {
      const res = await fetch(
        perPost ? '/api/send-post-content-for-review' : '/api/send-content-for-review',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.id,
            proposedContent: proposedContent.trim(),
            proposedImages,
            ...(perPost ? { postIndex } : {}),
          }),
        }
      )

      const responseData = await res.json().catch(() => ({}))
      console.log('📡 استجابة الخادم:', { status: res.status, data: responseData })

      if (res.ok) {
        showToast(
          `تم إرسال المحتوى للعميل (النص + ${proposedImages.length} صور)`,
          'success'
        )
        onSent()
      } else {
        showToast(responseData.error ?? 'فشل إرسال المحتوى', 'error')
      }
    } catch (err) {
      console.error('❌ خطأ في إرسال المحتوى:', err)
      showToast('حدث خطأ في الإرسال', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-dark">
          {isRevision ? 'تعديل المحتوى وإعادة الإرسال' : 'إرسال المحتوى للمراجعة'}
          {postLabel ? <span className="text-green text-sm font-normal"> — {postLabel}</span> : null}
        </h3>
        <button
          onClick={onCancel}
          className="text-muted hover:text-dark text-sm"
        >
          ✕ إلغاء
        </button>
      </div>

      {isRevision ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
          ✏️ عدّل النص أو الصور بناءً على ملاحظات العميل ثم أعد الإرسال
        </div>
      ) : (
        <p className="text-sm text-muted">
          أرسل النص والتصميم المقترح للعميل للمراجعة والموافقة
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-dark mb-2">
          النص المقترح <span className="text-red-500">*</span>
        </label>
        <textarea
          value={proposedContent}
          onChange={e => setProposedContent(e.target.value)}
          placeholder="اكتب النص المقترح هنا..."
          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[120px] resize-y"
          maxLength={1000}
        />
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-muted">الحد الأقصى 1000 حرف</span>
          <span className="text-xs text-muted">{proposedContent.length}/1000</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-2">
          التصاميم المقترحة (اختياري)
        </label>
        <ContentImagesUploader
          images={proposedImages}
          onChange={setProposedImages}
          maxImages={5}
        />
        <p className="text-xs text-muted mt-1">
          يمكنك رفع التصاميم المقترحة (الحد الأقصى 5 صور)
        </p>
      </div>

      {/* ── المعاينة قبل الإرسال — كما سيراها العميل ── */}
      {(proposedContent.trim() || proposedImages.length > 0) && (
        <div className="rounded-2xl border-2 border-green/30 bg-green-50/40 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green/10 border-b border-green/20">
            <span>👁️</span>
            <h4 className="text-sm font-bold text-green-700">المعاينة قبل الإرسال — كما سيراها العميل</h4>
          </div>
          <div className="p-4 space-y-3" dir="rtl">
            {proposedContent.trim() ? (
              <div className="bg-white rounded-xl border border-border p-3 whitespace-pre-line text-sm text-dark">
                {proposedContent.trim()}
              </div>
            ) : (
              <p className="text-xs text-red-500">⚠️ لا يوجد نص — اكتب التغريدة المختارة أعلاه.</p>
            )}
            {proposedImages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {proposedImages.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`تصميم ${i + 1}`}
                    onClick={() => setLightbox(url)}
                    className="aspect-square w-full object-cover rounded-xl border border-border cursor-zoom-in"
                    title="اضغط للتكبير"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          إلغاء
        </Button>
        <Button
          onClick={handleSend}
          loading={loading}
          disabled={!proposedContent.trim()}
          className="flex-1"
        >
          📤 إرسال للعميل
        </Button>
      </div>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
