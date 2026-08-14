'use client'

import { useEffect, useState } from 'react'

type PublicComment = {
  rating: number
  comment: string
}

type ReviewsPayload = {
  summary: { count: number; average: number }
  comments: PublicComment[]
}

const stars = (rating: number) => `${'★'.repeat(Math.max(0, Math.min(5, rating)))}${'☆'.repeat(Math.max(0, 5 - rating))}`

export default function RequestReviewsTrust() {
  const [reviews, setReviews] = useState<ReviewsPayload | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/request-reviews/public', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (data?.summary?.count) setReviews(data)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  if (!reviews) return null

  const hasComments = reviews.comments.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => hasComments && setOpen(true)}
        className="mx-auto mb-5 flex w-full max-w-3xl items-center justify-center gap-2 rounded-lg border border-gold/30 bg-white/75 px-3 py-2.5 text-xs shadow-sm backdrop-blur-md transition hover:border-gold/60 hover:bg-white sm:gap-3 sm:text-sm"
        aria-haspopup={hasComments ? 'dialog' : undefined}
      >
        <span className="whitespace-nowrap font-black text-gold" dir="ltr" aria-label={`${reviews.summary.average} من 5 نجوم`}>★ {reviews.summary.average.toLocaleString('ar-SA')}</span>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span className="whitespace-nowrap font-bold text-dark">{reviews.summary.count.toLocaleString('ar-SA')} تقييمات موثقة</span>
        {hasComments && <><span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" /><span className="hidden font-bold text-green sm:inline">عرض آراء العملاء ←</span></>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-dark/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="request-reviews-title" onMouseDown={event => event.target === event.currentTarget && setOpen(false)}>
          <section className="flex max-h-[82dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-lg border border-white/40 bg-white shadow-2xl sm:rounded-lg">
            <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-bold text-gold">تقييمات مرتبطة بطلبات مكتملة</p>
                <h2 id="request-reviews-title" className="mt-1 text-xl font-black text-dark">آراء عملائنا</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-xl text-muted transition hover:bg-slate-50 hover:text-dark" aria-label="إغلاق">×</button>
            </header>

            <div className="flex items-center justify-between gap-4 bg-gold/10 px-4 py-3 sm:px-5">
              <div className="text-gold" dir="ltr" aria-hidden="true">{stars(Math.round(reviews.summary.average))}</div>
              <p className="text-sm font-black text-dark">{reviews.summary.average.toLocaleString('ar-SA')} من ٥ · {reviews.summary.count.toLocaleString('ar-SA')} تقييمات موثقة</p>
            </div>

            <div className="space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {reviews.comments.map((review, index) => (
                <article key={`${review.rating}-${index}`} className="rounded-lg border border-border bg-cream/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-muted">عميل موثّق</span>
                    <span className="text-sm text-gold" dir="ltr" aria-label={`${review.rating} من 5 نجوم`}>{stars(review.rating)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-dark">«{review.comment}»</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
