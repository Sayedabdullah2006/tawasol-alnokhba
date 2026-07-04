'use client'

import { useState } from 'react'
import ImageLightbox from '@/components/ui/ImageLightbox'
import ScheduleSuggestions from '@/components/admin/ScheduleSuggestions'
import { getReviewItems, getPostReviews } from '@/lib/review-items'

interface Props {
  request: any
  // تعديل المحتوى/الصور المُرسلة لخبر قبل موافقة العميل (يفتح محرّر الإرسال مملوءاً)
  onEdit?: (index: number, content: string, images: string[]) => void
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
export default function PostReviewStatus({ request, onEdit }: Props) {
  const items = getReviewItems(request)
  const reviews = getPostReviews(request)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // جدولة نشر المحتوى المعتمد
  const [sched, setSched] = useState<{ cover: string } | null>(null)
  const [schedWhen, setSchedWhen] = useState('')
  const [schedText, setSchedText] = useState('')
  const [schedBusy, setSchedBusy] = useState(false)

  const openSchedule = (cover: string, text: string) => { setSchedText(text || ''); setSchedWhen(''); setSched({ cover }) }
  const submitSchedule = async () => {
    if (!sched) return
    if (!schedText.trim() && !sched.cover) { alert('لا يوجد نص أو تصميم للجدولة'); return }
    if (!schedWhen) { alert('حدّد تاريخ ووقت الجدولة'); return }
    setSchedBusy(true)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: schedText, imageUrl: sched.cover || undefined, scheduledLocal: schedWhen }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error ?? 'فشل الجدولة'); return }
      const n = Array.isArray(d.accountIds) ? d.accountIds.length : 0
      alert(`تمت الجدولة في ${n} قناة بتوقيت السعودية 🗓️`)
      setSched(null)
    } catch { alert('حدث خطأ أثناء الجدولة') } finally { setSchedBusy(false) }
  }

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
                  <p className="text-[11px] text-muted mt-1">عدّل المحتوى/الصور وأعد الإرسال، أو أعد التوليد من الاستوديو.</p>
                </div>
              )}

              {/* تعديل المحتوى/الصور المُرسلة قبل موافقة العميل */}
              {status !== 'approved' && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(item.index, r.proposed_content ?? '', images)}
                  className="w-full rounded-lg py-1.5 text-[11px] font-bold bg-white border border-green text-green hover:bg-green/5 transition-colors"
                >
                  ✏️ تعديل المحتوى والصور المُرسلة
                </button>
              )}

              {/* جدولة نشر المحتوى المعتمد على القنوات */}
              {status === 'approved' && (
                <button
                  type="button"
                  onClick={() => openSchedule((r.selected_image as string) ?? images[0] ?? '', r.proposed_content ?? '')}
                  className="w-full rounded-lg py-1.5 text-[11px] font-bold bg-green text-white hover:opacity-90 transition"
                >
                  🗓️ جدولة نشر هذا المحتوى
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* نافذة جدولة نشر المحتوى المعتمد */}
      {sched && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => schedBusy ? null : setSched(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-black text-dark text-base">🗓️ جدولة نشر المحتوى المعتمد</h3>
              <p className="text-xs text-muted mt-0.5">يُنشر التصميم والنص في كل القنوات المربوطة في الموعد المحدّد (توقيت السعودية).</p>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-3">
              {sched.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sched.cover} alt="التصميم" className="w-32 mx-auto aspect-[4/5] object-cover rounded-xl border border-border" />
              )}
              <div>
                <label className="block text-xs font-bold text-dark mb-1">الموعد (توقيت السعودية):</label>
                <input type="datetime-local" value={schedWhen} onChange={e => setSchedWhen(e.target.value)} disabled={schedBusy}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm mb-2" />
                <ScheduleSuggestions value={schedWhen} onPick={setSchedWhen} />
              </div>
              <div>
                <label className="block text-xs font-bold text-dark mb-1">نص المنشور:</label>
                <textarea value={schedText} onChange={e => setSchedText(e.target.value)} disabled={schedBusy}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[110px] resize-y" placeholder="نص المنشور..." />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2">
              <button onClick={submitSchedule} disabled={schedBusy || !schedWhen}
                className="flex-1 bg-green text-white text-sm font-bold rounded-xl px-4 py-2 hover:opacity-90 transition disabled:opacity-60">
                {schedBusy ? '⏳ جارٍ الجدولة…' : '🗓️ جدولة النشر'}
              </button>
              <button onClick={() => setSched(null)} disabled={schedBusy} className="text-sm text-muted hover:text-dark px-3 py-2">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
