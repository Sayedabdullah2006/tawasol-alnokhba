'use client'

import { useState } from 'react'
import ImageLightbox from '@/components/ui/ImageLightbox'
import ScheduleSuggestions from '@/components/admin/ScheduleSuggestions'
import ContentImagesUploader from '@/components/request/ContentImagesUploader'
import { getReviewItems, getPostReviews } from '@/lib/review-items'

interface Props {
  request: any
  view?: 'current' | 'history'
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
export default function PostReviewStatus({ request, onEdit, view = 'current' }: Props) {
  const items = getReviewItems(request)
  const reviews = getPostReviews(request)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // جدولة نشر المحتوى المعتمد
  const [sched, setSched] = useState<{ cover: string } | null>(null)
  const [schedWhen, setSchedWhen] = useState('')
  const [schedText, setSchedText] = useState('')
  const [schedBusy, setSchedBusy] = useState(false)
  // سجل التصاميم المُرسلة (هيستوري) + تعديل دقيق
  const [historyOpen, setHistoryOpen] = useState<Record<number, boolean>>({})
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editReferenceImages, setEditReferenceImages] = useState<string[]>([])
  const [internalDrafts, setInternalDrafts] = useState<Record<string, string>>({})
  const [editBusy, setEditBusy] = useState(false)
  const [regenerating, setRegenerating] = useState<number | null>(null)

  const resend = (index: number, content: string, img: string) => onEdit?.(index, content, [img])
  const applyEdit = async (index: number, content: string) => {
    if (!editTarget || !editNote.trim()) { alert('اكتب التعديل المطلوب'); return }
    setEditBusy(true)
    try {
      const res = await fetch('/api/admin/ai-studio/edit-design', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: editTarget, note: editNote, referenceImageUrls: editReferenceImages }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error ?? 'فشل التعديل'); return }
      setEditTarget(null); setEditNote('')
      setInternalDrafts(current => ({ ...current, [editTarget]: d.imageUrl }))
      setEditReferenceImages([])
    } catch { alert('حدث خطأ أثناء التعديل') } finally { setEditBusy(false) }
  }

  const openSchedule = (cover: string, text: string) => { setSchedText(text || ''); setSchedWhen(''); setSched({ cover }) }
  const submitSchedule = async () => {
    if (!sched) return
    if (!schedText.trim() && !sched.cover) { alert('لا يوجد نص أو تصميم للجدولة'); return }
    if (!schedWhen) { alert('حدّد تاريخ ووقت الجدولة'); return }
    setSchedBusy(true)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: schedText, imageUrl: sched.cover || undefined, scheduledLocal: schedWhen, requestId: request.id, notifyClient: true }),
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

  if (view === 'history') {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-end justify-between gap-3">
          <div><h3 className="font-bold text-dark">سجل جولات المحتوى والتصاميم</h3><p className="mt-1 text-xs text-muted">كل جولة تمثل لقطة ثابتة لما أُرسل للعميل، مع اختياره وملاحظاته.</p></div>
          <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-muted">{sentCount} منشورات</span>
        </div>
        {items.map(item => {
          const review = reviews[item.index]
          if (!review) return null
          const rounds: any[] = Array.isArray(review.history) && review.history.length
            ? review.history
            : [{ content: review.proposed_content, images: review.proposed_images, feedback: review.user_feedback, approved: review.status === 'approved', selected_image: review.selected_image }]
          return (
            <section key={item.index} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-green/10 text-xs font-bold text-green">{item.index + 1}</span><h4 className="min-w-0 flex-1 truncate text-sm font-bold text-dark">{item.title}</h4></div>
              <div className="space-y-2 border-r-2 border-border pr-3">
                {[...rounds].reverse().map((round, reverseIndex) => {
                  const roundNumber = rounds.length - reverseIndex
                  const roundImages: string[] = Array.isArray(round.images) ? round.images : []
                  const isLatest = reverseIndex === 0
                  return (
                    <details key={roundNumber} open={isLatest} className="rounded-lg border border-border bg-cream/30">
                      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs">
                        <span className="font-bold text-dark">الجولة {roundNumber}</span>
                        {round.approved ? <span className="rounded-full bg-green/10 px-2 py-0.5 font-bold text-green">معتمدة</span> : round.feedback ? <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-bold text-yellow-700">طلب تعديل</span> : <span className="rounded-full bg-purple-100 px-2 py-0.5 font-bold text-purple-700">أُرسلت للمراجعة</span>}
                        <span className="mr-auto text-muted">{round.sent_at ? new Date(round.sent_at).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
                      </summary>
                      <div className="space-y-3 border-t border-border p-3">
                        {round.content && <p className="whitespace-pre-line rounded-lg border border-border bg-white p-3 text-xs leading-6 text-dark">{round.content}</p>}
                        {roundImages.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{roundImages.map((image, index) => <button key={index} type="button" onClick={() => setLightbox(image)} className={`relative aspect-[4/5] overflow-hidden rounded-lg border-2 ${round.selected_image === image ? 'border-green ring-2 ring-green/30' : 'border-border'}`}><img src={image} alt={`تصميم الجولة ${roundNumber}`} className="h-full w-full object-cover" />{round.selected_image === image && <span className="absolute left-1 top-1 rounded-full bg-green px-1.5 py-0.5 text-[10px] font-bold text-white">اختيار العميل</span>}</button>)}</div>}
                        {(round.text_feedback || round.design_feedback || round.feedback) && <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800"><p className="font-bold">ملاحظات العميل</p>{round.text_feedback && <p className="mt-1">النص: {round.text_feedback}</p>}{round.design_feedback && <p className="mt-1">التصميم: {round.design_feedback}</p>}{!round.text_feedback && !round.design_feedback && <p className="mt-1 whitespace-pre-line">{round.feedback}</p>}</div>}
                      </div>
                    </details>
                  )
                })}
              </div>
            </section>
          )
        })}
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      </div>
    )
  }

  const regenerateRevision = async (index: number) => {
    setRegenerating(index)
    try {
      const res = await fetch('/api/admin/regenerate-client-revision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, postIndex: index }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error ?? 'فشلت إعادة التوليد'); return }
      window.location.reload()
    } catch { alert('تعذر الاتصال بالخادم لإعادة التوليد') } finally { setRegenerating(null) }
  }

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
          const isLegacySingleRevision = !isCampaign && request?.status === 'changes_requested'
          const status = isLegacySingleRevision ? 'changes_requested' : (r.status ?? 'content_review')
          const meta = STATUS_META[status] ?? STATUS_META.content_review
          const images: string[] = Array.isArray(r.proposed_images) ? r.proposed_images : []
          const revision = request?.ai_posts?.[item.index]?.revised
            ?? (item.index === 0 ? request?.ai_revised_designs : null)
          const feedback = r.user_feedback ?? (!isCampaign ? request?.user_feedback : null)
          const textFeedback = r.text_feedback
          const designFeedback = r.design_feedback

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

              {isCampaign && (
                <p className="text-[11px] text-muted">
                  📅 الموعد المتوقع: <span className="font-bold text-dark">{r.proposed_date ? new Date(`${r.proposed_date.includes('T') ? r.proposed_date : `${r.proposed_date}T12:00`}:00+03:00`).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: r.proposed_date.includes('T') ? 'short' : undefined }) : 'لم يُحدد'}</span>
                </p>
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
              {status === 'changes_requested' && (textFeedback || designFeedback || feedback) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                  <p className="text-[11px] font-bold text-yellow-700 mb-0.5">ملاحظات العميل المعتمدة للتعديل:</p>
                  {r.revision_base_image && <button type="button" onClick={() => setLightbox(r.revision_base_image!)} className="mb-2 flex items-center gap-2 text-[11px] font-bold text-green"><img src={r.revision_base_image} alt="التصميم المختار كأساس" className="h-12 w-10 rounded border border-green object-cover" />التصميم الذي اختاره العميل كأساس</button>}
                  {textFeedback && <p className="text-xs text-yellow-700 whitespace-pre-line"><span className="font-bold">تعديل النص:</span> {textFeedback}</p>}
                  {designFeedback && <p className="mt-1 text-xs text-yellow-700 whitespace-pre-line"><span className="font-bold">تعديل التصميم:</span> {designFeedback}</p>}
                  {!textFeedback && !designFeedback && <p className="text-xs text-yellow-700 whitespace-pre-line">{feedback}</p>}
                  <p className="text-[11px] text-muted mt-1">تُجهّز نتيجة التعديل داخل الاستديو أولاً، ثم يقرر الأدمن ما يعيد إرساله للعميل.</p>
                  {Array.isArray(r.reference_images) && r.reference_images.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] font-bold text-yellow-700 mb-1">صور العميل المرجعية ({r.reference_images.length}):</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {r.reference_images.map((image: string, imageIndex: number) => <button key={imageIndex} type="button" onClick={() => setLightbox(image)} className="aspect-square overflow-hidden rounded border border-yellow-200"><img src={image} alt={`مرجع العميل ${imageIndex + 1}`} className="w-full h-full object-cover" /></button>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {status === 'changes_requested' && revision && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><h4 className="text-xs font-bold text-dark">نتائج التعديل بعد ملاحظات العميل</h4><p className="mt-0.5 text-[11px] text-muted">مسودة داخلية؛ اختر نتيجة أو عدّلها ثم أرسلها للمراجعة التالية.</p></div>
                    <button type="button" onClick={() => regenerateRevision(item.index)} disabled={regenerating !== null} className="shrink-0 rounded-lg border border-amber-400 bg-white px-2 py-1 text-[11px] font-bold text-amber-800 disabled:opacity-50">{regenerating === item.index ? 'جارٍ إعادة التوليد...' : '↻ إعادة التوليد'}</button>
                  </div>
                  {revision.revised_text && <div className="rounded-lg border border-sky-200 bg-white p-2 text-xs leading-6 text-dark"><span className="font-bold text-sky-800">النص المعدّل:</span><p className="mt-1 whitespace-pre-line">{revision.revised_text}</p></div>}
                  {Array.isArray(revision.designs) && revision.designs.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {revision.designs.map((design: { title?: string; imageUrl?: string }, designIndex: number) => design.imageUrl && (
                        <div key={designIndex} className="flex gap-2 rounded-lg border border-amber-200 bg-white p-2">
                          <button type="button" onClick={() => setLightbox(design.imageUrl!)} className="h-20 w-16 shrink-0 overflow-hidden rounded border border-border"><img src={design.imageUrl} alt={`نتيجة تعديل ${designIndex + 1}`} className="h-full w-full object-cover" /></button>
                          <div className="min-w-0 flex-1 space-y-1.5"><p className="truncate text-[11px] font-bold text-dark">{design.title ?? `نتيجة التعديل ${designIndex + 1}`}</p><div className="flex flex-wrap gap-1"><button type="button" onClick={() => onEdit?.(item.index, revision.revised_text || r.proposed_content || '', [design.imageUrl!])} className="rounded border border-green bg-green/5 px-2 py-1 text-[10px] font-bold text-green">مراجعة قبل الإرسال</button><button type="button" onClick={() => { setEditTarget(design.imageUrl!); setEditNote(''); setEditReferenceImages([]) }} className="rounded border border-border px-2 py-1 text-[10px] font-bold text-dark">تعديل التصميم</button></div></div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="rounded-lg border border-dashed border-amber-300 bg-white p-2 text-[11px] text-amber-900">لا توجد صورة في هذه النتيجة بعد. استخدم «إعادة التوليد» لتطبيق ملاحظة التصميم مرة أخرى.</p>}
                  {revision.designs?.map((design: { imageUrl?: string }, designIndex: number) => {
                    const draft = design.imageUrl ? internalDrafts[design.imageUrl] : undefined
                    if (!draft) return null
                    return <div key={`draft-${designIndex}`} className="rounded-lg border border-green/40 bg-green/5 p-2"><p className="mb-2 text-[11px] font-bold text-green">مسودة داخلية معدّلة - لم تُرسل للعميل</p><div className="flex gap-2"><button type="button" onClick={() => setLightbox(draft)} className="h-20 w-16 shrink-0 overflow-hidden rounded border border-green"><img src={draft} alt="مسودة التصميم المعدلة" className="h-full w-full object-cover" /></button><div className="flex min-w-0 flex-1 flex-wrap content-center gap-1"><button type="button" onClick={() => onEdit?.(item.index, revision.revised_text || r.proposed_content || '', [draft])} className="rounded border border-green bg-white px-2 py-1 text-[10px] font-bold text-green">فتح مراجعة الإرسال</button><button type="button" onClick={() => { setEditTarget(draft); setEditNote(''); setEditReferenceImages([]) }} className="rounded border border-border bg-white px-2 py-1 text-[10px] font-bold text-dark">تعديل إضافي</button></div></div></div>
                  })}
                  {editTarget && (revision.designs?.some((design: { imageUrl?: string }) => design.imageUrl === editTarget) || Object.values(internalDrafts).includes(editTarget)) && (
                    <div className="rounded-lg border border-border bg-white p-2 space-y-2"><textarea value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="اكتب تعديلك الإضافي على هذا التصميم" className="min-h-[72px] w-full rounded border border-border p-2 text-xs" /><div className="rounded border border-sky-100 bg-sky-50 p-2"><p className="mb-2 text-[11px] font-bold text-dark">صور لاستبدال أو تضمين جزء من هذا التصميم</p><ContentImagesUploader images={editReferenceImages} onChange={setEditReferenceImages} maxImages={5} /><p className="mt-2 text-[10px] leading-5 text-muted">ارفع صوراً عالية الدقة فقط. ستُستخدم مع التصميم المحدد، مع الحفاظ على الوجه والملامح والهيئة والملابس كما هي.</p></div><div className="flex gap-2"><button type="button" onClick={() => applyEdit(item.index, revision.revised_text || r.proposed_content || '')} disabled={editBusy || !editNote.trim()} className="rounded bg-green px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">{editBusy ? 'جارٍ التعديل...' : 'تطبيق كمسودة داخلية'}</button><button type="button" onClick={() => { setEditTarget(null); setEditNote(''); setEditReferenceImages([]) }} className="text-[11px] text-muted">إلغاء</button></div></div>
                  )}
                </div>
              )}

              {/* 📜 سجل التصاميم المُرسلة عبر الجولات + ملاحظات العميل لكل جولة */}
              {['history'].includes(view) && (() => {
                const rounds: any[] = Array.isArray(r.history) && r.history.length
                  ? r.history
                  : (images.length ? [{ images, content: r.proposed_content, feedback: r.user_feedback, approved: status === 'approved', selected_image: r.selected_image }] : [])
                if (!rounds.length) return null
                const open = historyOpen[item.index]
                return (
                  <div className="border-t border-border pt-2">
                    <button type="button" onClick={() => setHistoryOpen(p => ({ ...p, [item.index]: !p[item.index] }))}
                      className="text-[11px] font-bold text-green hover:underline">
                      📜 سجل التصاميم المُرسلة ({rounds.length} {rounds.length === 1 ? 'جولة' : 'جولات'}) {open ? '▲' : '▼'}
                    </button>
                    {open && (
                      <div className="mt-2 space-y-2">
                        {rounds.map((rd, ri) => (
                          <div key={ri} className="rounded-lg border border-border bg-white p-2 space-y-1.5">
                            <span className="text-[11px] font-bold text-dark">الجولة {ri + 1}{rd.approved ? ' — ✅ معتمدة' : ''}</span>
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                              {(Array.isArray(rd.images) ? rd.images : []).map((img: string, ii: number) => (
                                <div key={ii} className="space-y-0.5">
                                  <button type="button" onClick={() => setLightbox(img)}
                                    className={`relative aspect-[4/5] w-full rounded-lg overflow-hidden border-2 cursor-zoom-in ${rd.selected_image === img ? 'border-green ring-1 ring-green/40' : 'border-border'}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={img} alt={`جولة ${ri + 1}`} className="w-full h-full object-cover" />
                                  </button>
                                  {onEdit && (
                                    <div className="flex flex-col gap-0.5">
                                      <button type="button" onClick={() => resend(item.index, rd.content ?? r.proposed_content ?? '', img)}
                                        className="text-[10px] rounded bg-green/10 text-green py-0.5 hover:bg-green/20">📤 أعد إرساله</button>
                                      <button type="button" onClick={() => { setEditTarget(img); setEditNote('') }}
                                        className="text-[10px] rounded bg-cream text-dark py-0.5 hover:bg-border/40">✂️ عدّله</button>
                                    </div>
                                  )}
                                  {editTarget === img && (
                                    <div className="space-y-1">
                                      <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                                        placeholder="التعديل المطلوب (حذف/إضافة كلمة، حذف عنصر...) — يُطبَّق على نفس التصميم"
                                        className="w-full text-[10px] border border-border rounded p-1 min-h-[42px] resize-y" />
                                      <div className="flex gap-1">
                                        <button type="button" onClick={() => applyEdit(item.index, rd.content ?? r.proposed_content ?? '')}
                                          disabled={editBusy || !editNote.trim()}
                                          className="flex-1 text-[10px] rounded bg-green text-white py-0.5 disabled:opacity-50">{editBusy ? '⏳ جارٍ التعديل…' : 'طبّق وأرسل'}</button>
                                        <button type="button" onClick={() => { setEditTarget(null); setEditNote('') }} className="text-[10px] text-muted px-1">إلغاء</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            {rd.feedback && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded p-1.5">
                                <span className="text-[10px] font-bold text-yellow-700">ملاحظة العميل: </span>
                                <span className="text-[10px] text-yellow-700 whitespace-pre-line">{rd.feedback}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* تعديل المحتوى/الصور المُرسلة قبل موافقة العميل */}
              {status !== 'approved' && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(item.index, r.proposed_content ?? '', images)}
                  className="w-full rounded-lg py-1.5 text-[11px] font-bold bg-white border border-green text-green hover:bg-green/5 transition-colors"
                >
                  ✏️ فتح محرّر المحتوى والتصاميم
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
