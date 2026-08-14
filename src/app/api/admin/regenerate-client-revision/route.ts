import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { autoReviseFromFeedback } from '@/lib/auto-revise'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

type ClientRevisionReview = {
  user_feedback?: string
  text_feedback?: string
  design_feedback?: string
  revision_base_image?: string
  reference_images?: unknown
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { requestId?: string; postIndex?: number }
  if (!body.requestId || !Number.isInteger(body.postIndex) || (body.postIndex as number) < 0) {
    return NextResponse.json({ error: 'بيانات إعادة التوليد غير مكتملة' }, { status: 400 })
  }

  const postIndex = body.postIndex as number
  const { data: row } = await supabase.from('publish_requests').select('post_reviews, request_type, user_feedback').eq('id', body.requestId).single()
  const review = row?.post_reviews && typeof row.post_reviews === 'object'
    ? (row.post_reviews as Record<string, ClientRevisionReview>)[postIndex]
    : null
  const isCampaign = row?.request_type === 'campaign'
  const feedback = review?.user_feedback ?? (!isCampaign ? row?.user_feedback : null)
  if (!feedback) return NextResponse.json({ error: 'لا توجد ملاحظات عميل لإعادة تطبيقها' }, { status: 400 })

  await autoReviseFromFeedback({
    requestId: body.requestId,
    postIndex: isCampaign ? postIndex : null,
    feedback,
    textFeedback: review?.text_feedback ?? undefined,
    designFeedback: review?.design_feedback ?? undefined,
    selectedImage: review?.revision_base_image ?? undefined,
    referenceImages: Array.isArray(review?.reference_images) ? review.reference_images : [],
  })

  return NextResponse.json({ ok: true })
}
