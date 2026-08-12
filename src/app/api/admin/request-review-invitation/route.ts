import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendRequestReviewInvitation } from '@/lib/request-reviews'
import { generateRequestNumber } from '@/lib/utils'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { requestId } = await request.json().catch(() => ({}))
  if (typeof requestId !== 'string') return NextResponse.json({ error: 'رقم الطلب غير صالح' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: publishRequest } = await service
    .from('publish_requests')
    .select('id, request_number, client_name, client_email, status')
    .eq('id', requestId)
    .maybeSingle()

  if (!publishRequest || publishRequest.status !== 'completed' || !publishRequest.client_email) {
    return NextResponse.json({ error: 'لا يمكن إرسال دعوة تقييم لهذا الطلب' }, { status: 422 })
  }

  const sent = await sendRequestReviewInvitation({
    requestId: publishRequest.id,
    requestNumber: generateRequestNumber(publishRequest.request_number),
    clientName: publishRequest.client_name ?? 'عميلنا العزيز',
    clientEmail: publishRequest.client_email,
  })

  return NextResponse.json({ success: sent })
}
