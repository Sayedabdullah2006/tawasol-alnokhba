'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type ReviewData = {
  requestNumber: number | null
  clientName: string
  rating: number | null
  comment: string
  submittedAt: string | null
}

export default function RequestReviewPage() {
  const { token } = useParams<{ token: string }>()
  const [review, setReview] = useState<ReviewData | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/review/${token}`)
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'تعذّر فتح التقييم')
        setReview(data)
        setRating(data.rating ?? 0)
        setComment(data.comment ?? '')
      })
      .catch(reason => setError(reason.message || 'تعذّر فتح التقييم'))
      .finally(() => setLoading(false))
  }, [token])

  const submit = async () => {
    if (!rating) { setError('اختر عدد النجوم أولاً'); return }
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/review/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذّر حفظ التقييم')
      setSaved(true)
    } catch (reason: any) {
      setError(reason.message || 'تعذّر حفظ التقييم')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="mx-auto w-full max-w-xl px-4 py-20 text-center text-sm text-muted">جارٍ تجهيز التقييم...</section>
  if (error && !review) return <section className="mx-auto w-full max-w-xl px-4 py-20 text-center"><h1 className="text-xl font-black text-dark">تعذّر فتح التقييم</h1><p className="mt-3 text-sm text-red-600">{error}</p></section>

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-12 sm:py-20" dir="rtl">
      <div className="rounded-xl border border-white/70 bg-white/85 p-6 text-center shadow-lg backdrop-blur sm:p-9">
        {saved ? (
          <>
            <div className="text-5xl">شكراً</div>
            <h1 className="mt-4 text-2xl font-black text-dark">وصلنا تقييمك</h1>
            <p className="mt-3 text-sm leading-7 text-muted">رأيك يساعدنا على تقديم تجربة أفضل في كل طلب قادم.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-gold">تواصل النخبة</p>
            <h1 className="mt-2 text-2xl font-black text-dark">كيف كانت تجربتك؟</h1>
            <p className="mt-3 text-sm leading-7 text-muted">{review?.clientName ? `شكراً يا ${review.clientName}،` : 'شكراً لك،'} نود معرفة رأيك في الخدمة.</p>
            <div className="mt-7 flex justify-center gap-2" dir="ltr" aria-label="تقييم بالنجوم">
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} type="button" onClick={() => setRating(star)} className={`h-12 w-12 text-4xl transition-transform hover:scale-110 ${star <= rating ? 'text-gold' : 'text-slate-200'}`} aria-label={`${star} نجوم`}>★</button>
              ))}
            </div>
            <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1000} rows={5} className="mt-7 w-full resize-y rounded-lg border border-border bg-white px-3 py-3 text-right text-sm text-dark outline-none focus:border-green" placeholder="اكتب ملاحظتك إن رغبت (اختياري)" />
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button type="button" onClick={submit} disabled={saving} className="mt-5 w-full rounded-lg bg-green px-4 py-3 text-sm font-black text-white transition hover:bg-green/90 disabled:opacity-60">{saving ? 'جارٍ الإرسال...' : review?.submittedAt ? 'تحديث التقييم' : 'إرسال التقييم'}</button>
          </>
        )}
      </div>
    </section>
  )
}
