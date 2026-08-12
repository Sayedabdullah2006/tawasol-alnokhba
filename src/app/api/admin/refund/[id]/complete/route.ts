import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyRefundUpdateToClient } from '@/lib/email'
import { generateRequestNumber } from '@/lib/utils'

const MANUAL_TIMING = 'يومين إلى 5 أيام عمل'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await params
  const service = await createServiceRoleClient()
  const { data: refund } = await service.from('payment_refunds').select('*').eq('id', id).maybeSingle()
  if (!refund) return NextResponse.json({ error: 'طلب الاسترجاع غير موجود' }, { status: 404 })
  if (refund.provider !== 'manual' || refund.status !== 'pending') return NextResponse.json({ error: 'هذا الطلب لا يحتاج تأكيد تحويل يدوي' }, { status: 422 })

  const { data: publishRequest } = await service.from('publish_requests')
    .select('id, request_number, client_name, client_email, final_total, admin_quoted_price')
    .eq('id', refund.request_id).maybeSingle()
  if (!publishRequest) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

  const now = new Date().toISOString()
  const { error: refundError } = await service.from('payment_refunds').update({
    status: 'completed', processed_at: now, updated_at: now,
  }).eq('id', id).eq('status', 'pending')
  if (refundError) return NextResponse.json({ error: 'تعذّر تأكيد التحويل' }, { status: 500 })

  const { data: completedRefunds } = await service.from('payment_refunds').select('amount')
    .eq('request_id', refund.request_id).eq('status', 'completed')
  const refundedAmount = (completedRefunds ?? []).reduce((total, item) => total + Number(item.amount), 0)
  const paidAmount = Number(publishRequest.final_total ?? publishRequest.admin_quoted_price ?? 0)
  const isFullRefund = refundedAmount >= paidAmount - 0.001

  const { error: requestError } = await service.from('publish_requests').update({
    ...(isFullRefund ? { status: 'refunded' } : {}),
    payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
    refund_amount: Math.round(refundedAmount * 100) / 100,
    refund_timing: MANUAL_TIMING,
    updated_at: now,
  }).eq('id', refund.request_id)
  if (requestError) return NextResponse.json({ error: 'تم التحويل ولكن تعذّر تحديث حالة الطلب' }, { status: 500 })

  if (publishRequest.client_email) {
    notifyRefundUpdateToClient({
      email: publishRequest.client_email,
      requestNumber: generateRequestNumber(publishRequest.request_number),
      clientName: publishRequest.client_name ?? 'عميلنا العزيز',
      amount: Number(refund.amount), timing: MANUAL_TIMING, isPending: false,
    }).catch(error => console.error('Refund completion email failed:', error))
  }

  return NextResponse.json({ success: true, isFullRefund })
}
