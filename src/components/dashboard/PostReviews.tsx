'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import ImageLightbox from '@/components/ui/ImageLightbox'
import ContentImagesUploader from '@/components/request/ContentImagesUploader'
import { getReviewItems, getPostReviews } from '@/lib/review-items'
import type { PublishRequest } from '@/types/publish-request'

interface Props {
  request: PublishRequest
}

/**
 * مراجعة العميل لمحتوى كل خبر على حدة:
 * - يرى النص + التصاميم المُرسلة لذلك الخبر.
 * - يختار تصميماً واحداً (راديو) ثم يعتمد، أو يطلب تعديلاً.
 * - كل خبر يحمل حالته (بانتظار/معتمد/تعديل مطلوب) مستقلاً.
 */
export default function PostReviews({ request }: Props) {
  const { showToast } = useToast()
  const items = getReviewItems(request)
  const reviews = getPostReviews(request)

  const [selected, setSelected] = useState<Record<number, string>>({})
  const [proposedDates, setProposedDates] = useState<Record<number, string>>({})
  const [feedbackOpen, setFeedbackOpen] = useState<Record<number, boolean>>({})
  const [textFeedback, setTextFeedback] = useState<Record<number, string>>({})
  const [designFeedback, setDesignFeedback] = useState<Record<number, string>>({})
  const [referenceImages, setReferenceImages] = useState<Record<number, string[]>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // نعرض فقط إن كان هناك أي خبر أُرسل محتواه
  const hasAny = items.some(it => reviews[it.index])
  if (!hasAny) return null

  const isCampaign = request?.request_type === 'campaign'
  const sentItems = items.filter(item => !!reviews[item.index])
  const approvedItems = sentItems.filter(item => reviews[item.index]?.status === 'approved').length

  const approve = async (index: number, images: string[]) => {
    const chosen = selected[index] ?? (images.length === 1 ? images[0] : undefined)
    if (images.length > 0 && !chosen) {
      showToast('اختر تصميماً أولاً', 'error')
      return
    }
    setBusy(index)
    try {
      const res = await fetch('/api/approve-post-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          postIndex: index,
          selectedImage: chosen ?? null,
          proposedDate: proposedDates[index] ?? reviews[index]?.proposed_date ?? null,
        }),
      })
      if (res.ok) {
        showToast('تم اعتماد المحتوى')
        window.location.reload()
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error ?? 'فشل الاعتماد', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setBusy(null)
    }
  }

  const requestChanges = async (index: number) => {
    const textNote = (textFeedback[index] ?? '').trim()
    const designNote = (designFeedback[index] ?? '').trim()
    const chosen = selected[index]
    if (!textNote && !designNote) { showToast('اكتب تعديل النص أو التصميم', 'error'); return }
    if (!chosen) { showToast('اختر التصميم الأقرب لما تريده أولاً', 'error'); return }
    setBusy(index)
    try {
      const res = await fetch('/api/request-post-content-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, postIndex: index, selectedImage: chosen, textFeedback: textNote, designFeedback: designNote, referenceImages: referenceImages[index] ?? [] }),
      })
      if (res.ok) {
        showToast('تم إرسال ملاحظاتك للإدارة')
        window.location.reload()
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error ?? 'فشل إرسال الملاحظات', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 space-y-4" dir="rtl">
      <div className="text-center">
        <div className="text-3xl mb-1">👁️</div>
        <h3 className="font-bold text-purple-700 text-lg">
          {isCampaign ? 'مراجعة محتوى الحملة (كل خبر على حدة)' : 'المحتوى جاهز للمراجعة'}
        </h3>
        <p className="text-sm text-purple-600 mt-1">
          راجع كل خبر، اختر التصميم الذي تريده ثم اعتمده، أو اطلب تعديلاً.
        </p>
        {isCampaign && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-700">
            <span>تم اعتماد {approvedItems} من {sentItems.length} أخبار</span>
            {approvedItems < sentItems.length && <span className="text-purple-500">· المتبقي {sentItems.length - approvedItems}</span>}
          </div>
        )}
      </div>

      {items.map(item => {
        const r = reviews[item.index]
        if (!r) {
          // خبر لم يُرسل محتواه بعد (في الحملات)
          return isCampaign ? (
            <div key={item.index} className="bg-gray-50 border border-border rounded-2xl p-4 opacity-70">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">
                  {item.index + 1}
                </span>
                <span className="font-bold text-dark text-sm">{item.title}</span>
                <span className="text-xs text-muted mr-auto">⏳ لم يصل محتواه بعد</span>
              </div>
            </div>
          ) : null
        }

        const images: string[] = Array.isArray(r.proposed_images) ? r.proposed_images : []
        const status = r.status ?? 'content_review'
        const isReview = status === 'content_review'
        const isApproved = status === 'approved'
        const isChanges = status === 'changes_requested'
        const chosen = selected[item.index] ?? (images.length === 1 ? images[0] : undefined)

        return (
          <div
            key={item.index}
            className={`rounded-2xl p-5 border ${
              isApproved ? 'bg-green-50 border-green-200'
              : isChanges ? 'bg-yellow-50 border-yellow-200'
              : 'bg-purple-50 border-purple-200'
            }`}
          >
            {/* ترويسة الخبر */}
            <div className="flex items-start gap-2 mb-3">
              {isCampaign && (
                <span className="w-6 h-6 rounded-full bg-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">
                  {item.index + 1}
                </span>
              )}
              <span className="font-bold text-dark text-sm flex-1 leading-relaxed">{isCampaign ? `الخبر ${item.index + 1}: ` : ''}{item.title}</span>
              {isApproved && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✅ معتمد</span>}
              {isChanges && <span className="text-xs font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">🔄 طلبت تعديلاً</span>}
              {isReview && <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">👁️ بانتظار مراجعتك</span>}
            </div>

            {/* النص المقترح */}
            {r.proposed_content && (
              <div className="bg-white rounded-xl p-3 mb-3">
                <h4 className="font-bold text-dark text-xs mb-1">النص المقترح:</h4>
                <p className="text-dark text-sm leading-relaxed whitespace-pre-line">{r.proposed_content}</p>
              </div>
            )}

            {isCampaign && (
              <div className="bg-white rounded-xl p-3 mb-3">
                <label className="block font-bold text-dark text-xs mb-1">موعد النشر المتوقع</label>
                {isReview ? (
                  <input
                    type="datetime-local"
                    value={(proposedDates[item.index] ?? r.proposed_date ?? '').replace(/^([0-9]{4}-[0-9]{2}-[0-9]{2})$/, '$1T18:00')}
                    onChange={event => setProposedDates(prev => ({ ...prev, [item.index]: event.target.value }))}
                    className="w-full max-w-xs px-3 py-2 rounded-lg border border-border bg-white text-sm"
                  />
                ) : (
                  <p className="text-sm text-muted">{r.proposed_date ? new Date(`${r.proposed_date.includes('T') ? r.proposed_date : `${r.proposed_date}T12:00`}:00+03:00`).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: r.proposed_date.includes('T') ? 'short' : undefined }) : 'لم يُحدد'}</p>
                )}
                {isReview && <p className="text-[11px] text-muted mt-1">يمكنك تغيير الموعد المقترح، ويصل التعديل للإدارة مع اعتماد المنشور.</p>}
              </div>
            )}

            {/* التصاميم */}
            {images.length > 0 && (
              <div className="bg-white rounded-xl p-3 mb-3">
                <h4 className="font-bold text-dark text-xs mb-2">
                  {isApproved ? 'التصميم المعتمد:' : 'اختر التصميم الأقرب لما تريده:'}
                </h4>
                {!isApproved && <p className="text-[11px] text-muted mb-2">حدّد تصميمًا واحدًا كأساس لاعتماده أو لتعديل تصميمه فقط. لا تُعدَّل بقية الخيارات.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {images.map((img, i) => {
                    const isSel = isApproved ? r.selected_image === img : chosen === img
                    const dim = isApproved && r.selected_image && r.selected_image !== img
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!isReview}
                        onClick={() => setSelected(prev => ({ ...prev, [item.index]: img }))}
                        className={`relative aspect-[4/5] rounded-lg overflow-hidden border-2 transition-all ${
                          isSel ? 'border-green ring-2 ring-green/40' : 'border-border'
                        } ${dim ? 'opacity-40' : ''} ${isReview ? 'cursor-pointer hover:border-purple-300' : 'cursor-default'}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt={`تصميم ${i + 1}`} className="w-full h-full object-cover" />
                        {isSel && (
                          <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-green text-white text-xs flex items-center justify-center">✓</span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setLightbox(img) }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 hover:bg-black/75 text-white text-xs flex items-center justify-center"
                          title="تكبير"
                        >
                          ⛶
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ملاحظات سابقة عند طلب التعديل */}
            {isChanges && r.user_feedback && (
              <div className="bg-white rounded-xl p-3 mb-3">
                <h4 className="font-bold text-yellow-700 text-xs mb-1">ملاحظاتك المُرسلة:</h4>
                <p className="text-sm text-yellow-700 whitespace-pre-line">{r.user_feedback}</p>
                <p className="text-xs text-muted mt-1">بانتظار تعديل الإدارة وإعادة الإرسال.</p>
                {Array.isArray(r.reference_images) && r.reference_images.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {r.reference_images.map((image, imageIndex) => <button key={imageIndex} type="button" onClick={() => setLightbox(image)} className="aspect-square overflow-hidden rounded-lg border border-border"><img src={image} alt={`صورة مرجعية ${imageIndex + 1}`} className="w-full h-full object-cover" /></button>)}
                  </div>
                )}
              </div>
            )}

            {/* الإجراءات — فقط أثناء المراجعة */}
            {isReview && (
              !feedbackOpen[item.index] ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() => approve(item.index, images)}
                    loading={busy === item.index}
                    disabled={busy !== null}
                    className="flex-1"
                    size="sm"
                  >
                    ✅ اعتمد هذا الخبر
                  </Button>
                  <Button
                    onClick={() => setFeedbackOpen(prev => ({ ...prev, [item.index]: true }))}
                    variant="outline"
                    disabled={busy !== null}
                    className="flex-1"
                    size="sm"
                  >
                    ✏️ اطلب تعديلاً
                  </Button>
                </div>
              ) : (
                <div className="bg-white rounded-xl p-3 space-y-2">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-[11px] text-purple-700 leading-relaxed">
                    ✍️ لتُنفَّذ ملاحظاتك بدقّة، اكتبها محدّدة وواضحة. مثال:
                    <span className="block mt-1 text-purple-600">«احذف عبارة (كذا) · أضِف (كذا) أسفل الاسم · كبّر اسم الشخص · اجعل الخلفية أغمق · غيّر لون العنوان».</span>
                  </div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-2.5">
                    <label className="block text-[11px] font-bold text-sky-900 mb-1">تعديلات نص التغريدة</label>
                    <textarea
                      value={textFeedback[item.index] ?? ''}
                      onChange={e => setTextFeedback(prev => ({ ...prev, [item.index]: e.target.value }))}
                      placeholder="مثال: اختصر البداية أو عدّل صياغة محددة أو أضف وسمًا مناسبًا..."
                      className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm min-h-[76px] resize-y"
                      maxLength={500}
                    />
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5">
                    <label className="block text-[11px] font-bold text-purple-900 mb-1">تعديلات التصميم المختار</label>
                    <textarea
                      value={designFeedback[item.index] ?? ''}
                      onChange={e => setDesignFeedback(prev => ({ ...prev, [item.index]: e.target.value }))}
                      placeholder="مثال: كبّر اسم الشخصية، استبدل الصورة، أو عدّل ترتيب العناصر..."
                      className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white text-sm min-h-[76px] resize-y"
                      maxLength={500}
                    />
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5">
                    <p className="text-[11px] font-bold text-purple-800">صور مرجعية للتعديل (اختياري)</p>
                    <p className="text-[11px] text-purple-700 mt-0.5">إذا رغبت في تضمين أو استبدال صورة، ارفعها هنا بدقة عالية قدر الإمكان. ستُؤخذ الصور والملاحظة معاً في الاعتبار قبل إعادة التوليد.</p>
                    <div className="mt-2"><ContentImagesUploader images={referenceImages[item.index] ?? []} onChange={images => setReferenceImages(prev => ({ ...prev, [item.index]: images }))} maxImages={5} /></div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => { setFeedbackOpen(prev => ({ ...prev, [item.index]: false })); setTextFeedback(prev => ({ ...prev, [item.index]: '' })); setDesignFeedback(prev => ({ ...prev, [item.index]: '' })); setReferenceImages(prev => ({ ...prev, [item.index]: [] })) }}
                      className="flex-1"
                      size="sm"
                    >
                      إلغاء
                    </Button>
                    <Button
                      onClick={() => requestChanges(item.index)}
                      loading={busy === item.index}
                      disabled={busy !== null || (!textFeedback[item.index]?.trim() && !designFeedback[item.index]?.trim())}
                      className="flex-1"
                      size="sm"
                    >
                      📤 إرسال الملاحظات
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )
      })}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
