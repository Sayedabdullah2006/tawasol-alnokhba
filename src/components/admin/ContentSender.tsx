'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import ContentImagesUploader from '@/components/request/ContentImagesUploader'

interface ContentSenderProps {
  request: any
  onSent: () => void
  onCancel: () => void
}

export default function ContentSender({ request, onSent, onCancel }: ContentSenderProps) {
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [proposedContent, setProposedContent] = useState('')
  const [proposedImages, setProposedImages] = useState<string[]>([])

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

    setLoading(true)
    try {
      const res = await fetch('/api/send-content-for-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          proposedContent: proposedContent.trim(),
          proposedImages,
        }),
      })

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
        <h3 className="font-bold text-dark">إرسال المحتوى للمراجعة</h3>
        <button
          onClick={onCancel}
          className="text-muted hover:text-dark text-sm"
        >
          ✕ إلغاء
        </button>
      </div>

      <p className="text-sm text-muted">
        أرسل النص والتصميم المقترح للعميل للمراجعة والموافقة
      </p>

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
    </div>
  )
}