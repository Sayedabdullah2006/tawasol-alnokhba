import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type PublicReviewRow = {
  rating: number | null
  comment: string | null
  submitted_at: string | null
}

export async function GET() {
  const service = await createServiceRoleClient()
  const { data, error } = await service
    .from('request_reviews')
    .select('rating, comment, submitted_at')
    .not('submitted_at', 'is', null)
    .not('rating', 'is', null)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Fetch public request reviews error:', error)
    return NextResponse.json({ error: 'تعذّر تحميل تقييمات العملاء' }, { status: 500 })
  }

  const reviews = (data ?? []) as PublicReviewRow[]
  const ratingTotal = reviews.reduce((total, review) => total + Number(review.rating ?? 0), 0)
  const comments = reviews
    .filter(review => review.comment?.trim())
    .map(review => ({
      rating: Number(review.rating),
      comment: review.comment!.trim(),
    }))

  return NextResponse.json({
    summary: {
      count: reviews.length,
      average: reviews.length ? Math.round((ratingTotal / reviews.length) * 10) / 10 : 0,
    },
    comments,
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
