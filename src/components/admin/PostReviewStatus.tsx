'use client'

import { useState } from 'react'
import ImageLightbox from '@/components/ui/ImageLightbox'
import { getReviewItems, getPostReviews } from '@/lib/review-items'

interface Props {
  request: any
}

/**
 * لوحة للأدمن تُظهر حالة مراجعة العميل لكل خبر:
 * معتمد (مع التصميم المختار) / طلب تعديل (مع الملاحظات) / بانتظار المراجعة.
 * تساعد الأدمن على معرفة أي خبر يحتاج إعادة تصميم/إرسال عبر الاستوديو.
 */
export default function PostReviewStatus({ request }: Props) {
  const items = getReviewItems(request)
  const reviews = getPostReviews(request)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const hasAny = items.some(it => reviews[it.index])
  if (!hasAny) return null

  const isCampaign = request?.request_type === 'campaign'
  const approvedCount = items.filter(it => reviews[it.index]?.status === 'approved').length

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-dark flex items-center gap-2">📊 حالة مراجعة العميل</h3>
        {isCampaign && (
          <span className="text-xs bg-green/10 text-green-700 font-bold px-2 py-0.5 rounded-full">
            معتمد {approvedCount}/{items.length}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const r = reviews[item.index]
          const status = r?.status
          return (
            <div key={item.index} className="rounded-xl border border-border bg-cream/40 p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                {isCampaign && (
                  <span className="w-5 h-5 rounded-full bg-green/10 text-green text-[11px] font-bold flex items-center justify-center">
                    {item.index + 1}
                  </span>
                )}
                <span className="font-bold text-dark text-xs flex-1 truncate">{item.title}</span>
                {!r && <span className="text-[11px] text-muted">لم يُرسل بعد</span>}
                {status === 'content_review' && <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">👁️ يراجعه العميل</span>}
                {status === 'approved' && <span className="text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✅ معتمد</span>}
                {status === 'changes_requested' && <span className="text-[11px] font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">🔄 طلب تعديل</span>}
              </div>

              {status === 'approved' && r?.selected_image && (
                <button type="button" onClick={() => setLightbox(r.selected_image!)} className="inline-block mt-1 cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.selected_image} alt="التصميم المعتمد" className="w-20 aspect-[4/5] object-cover rounded-lg border border-green/40" />
                </button>
              )}

              {status === 'changes_requested' && r?.user_feedback && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-1">
                  <p className="text-[11px] font-bold text-yellow-700 mb-0.5">ملاحظات العميل:</p>
                  <p className="text-xs text-yellow-700 whitespace-pre-line">{r.user_feedback}</p>
                  <p className="text-[11px] text-muted mt-1">أعد توليد التصميم لهذا الخبر من الاستوديو ثم أرسله مجدداً.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
