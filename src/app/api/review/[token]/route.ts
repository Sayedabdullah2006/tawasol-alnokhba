import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_: Request, { params }: RouteContext) {
  const { token } = await params
  const service = await createServiceRoleClient()
  const { data: review } = await service
    .from('request_reviews')
    .select('request_id, token_expires_at, rating, comment, submitted_at')
    .eq('review_token', token)
    .maybeSingle()

  if (!review) return NextResponse.json({ error: 'رابط التقييم غير صالح' }, { status: 404 })
  if (new Date(review.token_expires_at) < new Date()) return NextResponse.json({ error: 'انتهت صلاحية رابط التقييم' }, { status: 410 })

  const { data: request } = await service
    .from('publish_requests')
    .select('request_number, client_name')
    .eq('id', review.request_id)
    .maybeSingle()

  return NextResponse.json({
    requestNumber: request?.request_number ?? null,
    clientName: request?.client_name ?? '',
    rating: review.rating,
    comment: review.comment ?? '',
    submittedAt: review.submitted_at,
  })
}

export async function POST(request: Request, { params }: RouteContext) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 1000) {
    return NextResponse.json({ error: 'بيانات التقييم غير صالحة' }, { status: 400 })
  }

  const service = await createServiceRoleClient()
  const { data: review } = await service
    .from('request_reviews')
    .select('id, token_expires_at')
    .eq('review_token', token)
    .maybeSingle()

  if (!review) return NextResponse.json({ error: 'رابط التقييم غير صالح' }, { status: 404 })
  if (new Date(review.token_expires_at) < new Date()) return NextResponse.json({ error: 'انتهت صلاحية رابط التقييم' }, { status: 410 })

  const now = new Date().toISOString()
  const { error } = await service
    .from('request_reviews')
    .update({ rating, comment: comment || null, submitted_at: now, updated_at: now })
    .eq('id', review.id)

  if (error) {
    console.error('Save request review error:', error)
    return NextResponse.json({ error: 'تعذّر حفظ التقييم' }, { status: 500 })
  }

  return NextResponse.json({ success: true, submittedAt: now })
}
