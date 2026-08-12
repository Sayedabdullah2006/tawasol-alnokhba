import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyRefundUpdateToClient } from '@/lib/email'
import { generateRequestNumber } from '@/lib/utils'

const TIMING = {
  moyasar: '3 إلى 10 أيام عمل',
  tamara: 'ساعات إلى عدة أيام عمل',
  manual: 'يومين إلى 5 أيام عمل',
} as const

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params
  const service = await createServiceRoleClient()
  const { data: refund } = await service.from('payment_refunds').select('id, request_id, provider, amount').eq('id', id).maybeSingle()
  if (!refund || !['moyasar', 'tamara', 'manual'].includes(refund.provider)) {
    return NextResponse.json({ error: 'طلب الاسترجاع غير موجود' }, { status: 404 })
  }

  const { data: publishRequest } = await service.from('publish_requests')
    .select('request_number, client_name, client_email').eq('id', refund.request_id).maybeSingle()
  if (!publishRequest?.client_email) return NextResponse.json({ error: 'لا يوجد بريد إلكتروني للعميل' }, { status: 422 })

  const sent = await notifyRefundUpdateToClient({
    email: publishRequest.client_email,
    requestNumber: generateRequestNumber(publishRequest.request_number),
    clientName: publishRequest.client_name ?? 'عميلنا العزيز',
    amount: Number(refund.amount),
    timing: TIMING[refund.provider as keyof typeof TIMING],
    isPending: true,
  })
  if (!sent) return NextResponse.json({ error: 'تعذّر إرسال البريد. حاول مرة أخرى.' }, { status: 502 })

  return NextResponse.json({ success: true })
}
