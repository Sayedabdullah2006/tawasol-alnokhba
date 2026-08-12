import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendRequestReviewInvitation } from '@/lib/request-reviews'
import { generateRequestNumber } from '@/lib/utils'

export const maxDuration = 300

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const service = await createServiceRoleClient()
    const { data: completedRequests, error: requestsError } = await service
      .from('publish_requests')
      .select('id, request_number, client_name, client_email')
      .eq('status', 'completed')
      .not('client_email', 'is', null)

    if (requestsError) throw requestsError
    const requests = (completedRequests ?? []).filter(request => request.client_email?.trim())
    if (!requests.length) return NextResponse.json({ success: true, sent: 0, skipped: 0, failed: 0 })

    const { data: existingReviews, error: reviewsError } = await service
      .from('request_reviews')
      .select('request_id, rating')
      .in('request_id', requests.map(request => request.id))
    if (reviewsError) throw reviewsError

    const reviewed = new Set((existingReviews ?? []).filter(review => review.rating).map(review => review.request_id))
    const eligibleRequests = requests.filter(request => !reviewed.has(request.id))

    let sent = 0
    let failed = 0
    for (let index = 0; index < eligibleRequests.length; index += 1) {
      const publishRequest = eligibleRequests[index]
      try {
        const delivered = await sendRequestReviewInvitation({
          requestId: publishRequest.id,
          requestNumber: generateRequestNumber(publishRequest.request_number),
          clientName: publishRequest.client_name ?? 'عميلنا العزيز',
          clientEmail: publishRequest.client_email,
        })
        if (delivered) sent += 1
        else failed += 1
      } catch (error) {
        failed += 1
        console.error('Bulk request review invitation failed:', publishRequest.id, error)
      }
      if (index < eligibleRequests.length - 1) await sleep(600)
    }

    return NextResponse.json({ success: true, sent, failed, skipped: requests.length - eligibleRequests.length })
  } catch (error) {
    console.error('Bulk request review invitations error:', error)
    return NextResponse.json({ error: 'تعذّر إرسال دعوات التقييم' }, { status: 500 })
  }
}
