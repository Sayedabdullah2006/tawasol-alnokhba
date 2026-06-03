'use client'

import { useState } from 'react'
import ImageLightbox from '@/components/ui/ImageLightbox'
import { getReviewItems, getPostReviews } from '@/lib/review-items'

interface Props {
  request: any
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  content_review: { label: '👁️ قيد مراجعة العميل', cls: 'text-purple-700 bg-purple-100' },
  approved: { label: '✅ معتمد', cls: 'text-green-700 bg-green-100' },
  changes_requested: { label: '🔄 ملاحظات', cls: 'text-yellow-700 bg-yellow-100' },
}

/**
 * لوحة للأدمن تُظهر — لكل خبر أُرسل محتواه — النص والتصاميم المُرسلة فور الإرسال
 * (حتى قبل موافقة العميل)، مع ليبل الحالة: مراجعة / معتمد / ملاحظات.
 * عند الاعتماد يُميَّز التصميم المختار؛ وعند الملاحظات تظهر ملاحظات العميل.
 */
export default function PostReviewStatus({ request }: Props) {
  const items = getReviewItems(request)
  const reviews = getPostReviews(request)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const hasAny = items.some(it => reviews[it.index])
  if (!hasAny) return null

  const isCampaign = request?.request_type === 'campaign'
  const approvedCount = items.filter(it => reviews[it.index]?.status === 'approved').length
  const sentCount = items.filter(it => reviews[it.index]).length

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-dark flex items-center gap-2">📊 المحتوى المُرسل وحالة مراجعة العميل</h3>
        {isCampaign && (
          <span className="text-xs bg-green/10 text-green-700 font-bold px-2 py-0.5 rounded-full">
            معتمد {approvedCount}/{sentCount}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {items.map(item => {
          const r = reviews[item.index]
          if (!r) return null
          const status = r.status ?? 'content_review'
          const meta = STATUS_META[status] ?? STATUS_META.content_review
          const images: string[] = Array.isArray(r.proposed_images) ? r.proposed_images : []

          return (
            <div key={item.index} className="rounded-xl border border-border bg-cream/40 p-3 space-y-2">
              {/* ترويسة الخبر + الليبل */}
              <div className="flex items-center gap-2">
                {isCampaign && (
                  <span className="w-5 h-5 rounded-full bg-green/10 text-green text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                    {item.index + 1}
                  </span>
                )}
                <span className="font-bold text-dark text-xs flex-1 truncate">{item.title}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>
                  {meta.label}
                </span>
              </div>

              {/* النص المُرسل */}
              {r.proposed_content && (
                <div className="bg-white rounded-lg border border-border p-2">
                  <p className="text-[11px] font-bold text-muted mb-0.5">النص المُرسل:</p>
                  <p className="text-xs text-dark whitespace-pre-line">{r.proposed_content}</p>
                </div>
              )}

              {/* التصاميم المُرسلة (تظهر دائماً) — يُميَّز المعتمد عند الموافقة */}
              {images.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-muted mb-1">
                    التصاميم المُرسلة ({images.length}){status === 'approved' ? ' — ✅ المعتمد محدّد' : ''}:
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                    {images.map((img, i) => {
                      const isChosen = status === 'approved' && r.selected_image === img
                      const dim = status === 'approved' && r.selected_image && r.selected_image !== img
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightbox(img)}
                          className={`relative aspect-[4/5] rounded-lg overflow-hidden border-2 cursor-zoom-in ${
                            isChosen ? 'border-green ring-2 ring-green/40' : 'border-border'
                          } ${dim ? 'opacity-40' : ''}`}
                          title="تكبير"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt={`تصميم ${i + 1}`} className="w-full h-full object-cover" />
                          {isChosen && (
                            <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-green text-white text-[10px] flex items-center justify-center">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ملاحظات العميل عند طلب التعديل */}
              {status === 'changes_requested' && r.user_feedback && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
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
