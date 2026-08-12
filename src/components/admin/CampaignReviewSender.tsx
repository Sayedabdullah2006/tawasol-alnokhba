'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type ReviewItem = { content: string; images: string[] }

export default function CampaignReviewSender({ request, onSent }: { request: any; onSent: () => void }) {
  const { showToast } = useToast()
  const posts = Array.isArray(request?.campaign_posts) ? request.campaign_posts : []
  const [sending, setSending] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [dates, setDates] = useState<Record<number, string>>(() => Object.fromEntries(
    posts.map((post: any, index: number) => [index, typeof post?.preferred_date === 'string' ? (post.preferred_date.includes('T') ? post.preferred_date : `${post.preferred_date}T18:00`) : ''])
  ))
  const [items, setItems] = useState<Record<number, ReviewItem>>(() => Object.fromEntries(posts.map((post: any, index: number) => {
    const studio = request?.ai_posts?.[index] ?? {}
    // لا نختار أي تصميم تلقائياً: ما يصل للعميل هو ما يحدده الأدمن صراحةً في نافذة المراجعة.
    return [index, { content: String(studio?.tweets?.raw ?? post?.content ?? ''), images: [] }]
  })))
  const [suggestions, setSuggestions] = useState<Array<{ value: string }>>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const designsCount = useMemo(() => Object.values(items).reduce((total, item) => total + item.images.length, 0), [items])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/campaign-schedule-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: posts.length }) })
      .then(response => response.ok ? response.json() : { slots: [] })
      .then(data => {
        if (!alive || !Array.isArray(data.slots)) return
        setSuggestions(data.slots)
        // نبدأ دائماً من اقتراحات التقويم الحية، لا من تواريخ الطلب القديمة
        // (التي قد تكون متطابقة أو أصبحت في الماضي). بعد ظهورها يظل للأدمن
        // كامل الحرية في تعديل أي موعد قبل فتح مراجعة الإرسال.
        setDates(Object.fromEntries(data.slots.map((slot: { value: string }, index: number) => [index, slot.value])))
      })
      .finally(() => { if (alive) setLoadingSuggestions(false) })
    return () => { alive = false }
  }, [posts.length])

  if (request?.request_type !== 'campaign' || posts.length === 0) return null

  const toggleImage = (postIndex: number, image: string) => setItems(previous => {
    const item = previous[postIndex]
    const images = item.images.includes(image) ? item.images.filter(value => value !== image) : [...item.images, image]
    return { ...previous, [postIndex]: { ...item, images } }
  })

  const send = async () => {
    for (let index = 0; index < posts.length; index += 1) {
      if (!items[index]?.content.trim() || !items[index]?.images.length) {
        showToast(`راجع النص واختر تصميماً واحداً على الأقل للمنشور ${index + 1}`, 'error')
        return
      }
    }
    setSending(true)
    try {
      const res = await fetch('/api/send-campaign-content-for-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, proposedDates: dates, reviewItems: items }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(data.error ?? 'تعذّر إرسال الحملة للمراجعة', 'error'); return }
      showToast(`تم إرسال الحملة: ${data.postsCount} أخبار و${designsCount} تصاميم مختارة`)
      onSent()
    } catch { showToast('حدث خطأ في الاتصال', 'error') } finally { setSending(false) }
  }

  return (
    <div className="bg-green/5 border border-green/25 rounded-2xl p-5 space-y-3" dir="rtl">
      <div>
        <h4 className="font-bold text-dark">📬 إرسال الحملة كاملة للمراجعة</h4>
        <p className="text-sm text-muted mt-1">حدد مواعيد النشر، ثم راجع نص كل خبر والتصاميم المختارة في نافذة واحدة قبل وصولها للعميل.</p>
      </div>
      <div className="space-y-2 rounded-xl bg-white/70 border border-green/15 p-3">
        <p className="text-xs font-bold text-dark">مواعيد النشر المقترحة لكل خبر</p>
        {posts.map((post: any, index: number) => (
          <label key={index} className="flex flex-wrap items-center gap-2 text-xs text-dark">
            <span className="min-w-0 flex-1 truncate">{index + 1}. {post?.title || `منشور ${index + 1}`}</span>
            <input type="datetime-local" value={dates[index] ?? ''} onChange={event => setDates(previous => ({ ...previous, [index]: event.target.value }))}
              className="w-[145px] rounded-lg border border-border bg-white px-2 py-1.5 text-xs" />
          </label>
        ))}
        <p className="text-[11px] text-muted">{loadingSuggestions ? 'جارٍ فحص التقويم واقتراح المواعيد…' : 'الأول في أقرب وقت مناسب غير مزدحم، ثم فاصل يومين على الأقل. يمكنك تعديل أي موعد قبل الإرسال.'}</p>
        {!loadingSuggestions && suggestions.length > 0 && <p className="text-[11px] text-green-700">✓ تم اقتراح المواعيد من التقويم الحالي.</p>}
      </div>
      <Button onClick={() => setReviewOpen(true)} disabled={sending} className="w-full">👁️ مراجعة الحملة قبل الإرسال ({posts.length} أخبار · {designsCount} تصاميم)</Button>

      {reviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 p-3 sm:p-6 flex items-end sm:items-center justify-center" onClick={() => !sending && setReviewOpen(false)}>
          <div className="w-full max-w-4xl max-h-[94vh] overflow-hidden bg-white rounded-2xl shadow-2xl flex flex-col" onClick={event => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center gap-3"><div className="min-w-0 flex-1"><h3 className="font-black text-dark">مراجعة الحملة قبل الإرسال</h3><p className="text-xs text-muted mt-1">عدّل النص واختر التصاميم التي ستصل للعميل لكل خبر.</p></div><button type="button" onClick={() => setReviewOpen(false)} disabled={sending} className="text-muted text-xl">×</button></div>
            <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
              {posts.map((post: any, index: number) => {
                const studio = request?.ai_posts?.[index] ?? {}
                const allImages: string[] = Array.isArray(studio?.designs) ? studio.designs.map((design: any) => design?.imageUrl).filter(Boolean) : []
                const item = items[index] ?? { content: '', images: [] }
                return <section key={index} className="rounded-xl border border-border p-3 sm:p-4 space-y-3">
                  <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-green/10 text-green text-xs font-bold flex items-center justify-center">{index + 1}</span><h4 className="font-bold text-dark text-sm flex-1">{post?.title || `منشور ${index + 1}`}</h4><span className="text-[11px] text-muted">{dates[index] || 'بلا موعد'}</span></div>
                  <textarea value={item.content} onChange={event => setItems(previous => ({ ...previous, [index]: { ...item, content: event.target.value } }))}
                    className="w-full min-h-[110px] rounded-xl border border-border p-3 text-sm leading-relaxed resize-y" />
                  <div><p className="text-xs font-bold text-dark mb-2">التصاميم التي ستصل للعميل</p>{allImages.length ? <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{allImages.map((image, imageIndex) => { const checked = item.images.includes(image); return <button type="button" key={image} onClick={() => toggleImage(index, image)} className={`relative aspect-[4/5] overflow-hidden rounded-lg border-2 ${checked ? 'border-green ring-2 ring-green/30' : 'border-border opacity-55'}`}><img src={image} alt={`تصميم ${imageIndex + 1}`} className="w-full h-full object-cover" />{checked && <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-green text-white text-xs flex items-center justify-center">✓</span>}</button> })}</div> : <p className="text-xs text-red-600">لا توجد تصاميم مولّدة لهذا الخبر.</p>}</div>
                </section>
              })}
            </div>
            <div className="border-t border-border p-4 flex gap-2"><Button onClick={send} loading={sending} disabled={sending} className="flex-1">📬 إرسال الحملة للمراجعة</Button><Button variant="ghost" onClick={() => setReviewOpen(false)} disabled={sending}>إلغاء</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}
