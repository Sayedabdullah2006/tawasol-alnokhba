'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import ContentImagesUploader from '@/components/request/ContentImagesUploader'
import SupportingDocumentsUploader from '@/components/request/SupportingDocumentsUploader'
import type { SupportingDocument } from '@/lib/request-attachments'
import type { PublishRequest } from '@/types/publish-request'

interface Props {
  request: PublishRequest
}

interface PostEdit {
  title: string
  content: string
  images: string[]
  supportingDocuments: SupportingDocument[]
}

/**
 * نموذج تعديل العميل لطلبه عند طلب الإدارة معلومات/صورة (الحالة info_requested).
 * - طلب مفرد: عنوان + محتوى + صور.
 * - حملة: تعديل كل خبر (عنوان + محتوى + صور) على حدة.
 */
export default function RequestInfoEditor({ request }: Props) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const campaignPosts = Array.isArray(request.campaign_posts) ? request.campaign_posts : []
  const isCampaign = request.request_type === 'campaign' && campaignPosts.length > 0

  // طلب مفرد
  const [title, setTitle] = useState<string>(request.title ?? '')
  const [content, setContent] = useState<string>(request.content ?? '')
  const [images, setImages] = useState<string[]>(Array.isArray(request.content_images) ? request.content_images : [])
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocument[]>(
    Array.isArray(request.supporting_documents) ? request.supporting_documents as SupportingDocument[] : [],
  )

  // حملة
  const [posts, setPosts] = useState<PostEdit[]>(
    isCampaign
      ? campaignPosts.map((value: unknown) => {
          const p = value && typeof value === 'object' ? value as Record<string, unknown> : {}
          return {
            title: typeof p.title === 'string' ? p.title : '',
            content: typeof p.content === 'string' ? p.content : '',
            images: Array.isArray(p.images) ? p.images.filter((image): image is string => typeof image === 'string') : [],
            supportingDocuments: Array.isArray(p.supporting_documents)
              ? p.supporting_documents as SupportingDocument[]
              : [],
          }
        })
      : []
  )

  const updatePost = (i: number, patch: Partial<PostEdit>) => {
    setPosts(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  const submit = async () => {
    if (isCampaign) {
      if (posts.some(p => !p.content.trim())) {
        showToast('محتوى كل خبر مطلوب', 'error')
        return
      }
    } else if (!content.trim()) {
      showToast('محتوى الخبر مطلوب', 'error')
      return
    }

    setLoading(true)
    try {
      const payload: {
        requestId: string
        campaignPosts?: PostEdit[]
        title?: string
        content?: string
        contentImages?: string[]
        supportingDocuments?: SupportingDocument[]
      } = { requestId: request.id }
      if (isCampaign) payload.campaignPosts = posts
      else {
        payload.title = title
        payload.content = content
        payload.contentImages = images
        payload.supportingDocuments = supportingDocuments
      }

      const res = await fetch('/api/resubmit-request-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        showToast('تم إرسال التعديلات للإدارة')
        window.location.reload()
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error ?? 'فشل إرسال التعديلات', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4" dir="rtl">
      <div className="text-center">
        <div className="text-3xl mb-1">📩</div>
        <h3 className="font-bold text-orange-700 text-lg">مطلوب تعديل على طلبك</h3>
      </div>

      {/* رسالة الإدارة */}
      {request.admin_info_request && (
        <div className="bg-white rounded-xl p-4 border border-orange-200">
          <p className="text-xs font-bold text-orange-700 mb-1">طلب الإدارة:</p>
          <p className="text-sm text-dark whitespace-pre-line">{request.admin_info_request}</p>
        </div>
      )}

      {isCampaign ? (
        <div className="space-y-4">
          {posts.map((p, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="font-bold text-dark text-sm">منشور {i + 1}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark mb-1">عنوان الخبر</label>
                <input
                  value={p.title}
                  onChange={e => updatePost(i, { title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark mb-1">نص المحتوى</label>
                <textarea
                  value={p.content}
                  onChange={e => updatePost(i, { content: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm min-h-[100px] resize-y"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark mb-1">الصور الشخصية للتصميم</label>
                <ContentImagesUploader images={p.images} onChange={imgs => updatePost(i, { images: imgs })} maxImages={8} />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark mb-1">الوثائق الداعمة إن وجدت</label>
                <SupportingDocumentsUploader documents={p.supportingDocuments} onChange={documents => updatePost(i, { supportingDocuments: documents })} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-dark mb-1">عنوان الخبر</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">نص المحتوى</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm min-h-[120px] resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">الصور الشخصية للتصميم</label>
            <ContentImagesUploader images={images} onChange={setImages} maxImages={8} />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">الوثائق الداعمة إن وجدت</label>
            <SupportingDocumentsUploader documents={supportingDocuments} onChange={setSupportingDocuments} />
          </div>
        </div>
      )}

      <Button onClick={submit} loading={loading} disabled={loading} className="w-full">
        📤 إرسال التعديلات وإعادة الطلب
      </Button>
    </div>
  )
}
