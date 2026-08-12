import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { refundMoyasarPayment } from '@/lib/moyasar-server'
import { refundTamaraOrder } from '@/lib/tamara-server'
import { notifyRefundUpdateToClient } from '@/lib/email'
import { generateRequestNumber } from '@/lib/utils'

const TIMING = {
  moyasar: '3 إلى 10 أيام عمل',
  tamara: 'ساعات إلى عدة أيام عمل',
  manual: 'يومين إلى 5 أيام عمل',
} as const
type RefundProvider = keyof typeof TIMING

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const service = await createServiceRoleClient()
  const { data, error } = await service.from('payment_refunds').select('*').order('requested_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'تعذّر تحميل الاسترجاعات' }, { status: 500 })
  return NextResponse.json({ refunds: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const requestId = typeof body.requestId === 'string' ? body.requestId : ''
  const amount = Number(body.amount)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const provider: RefundProvider | null = body.provider === 'moyasar' || body.provider === 'tamara' || body.provider === 'manual' ? body.provider : null
  if (!requestId || !provider || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 || reason.length < 3 || reason.length > 1000) return NextResponse.json({ error: 'بيانات الاسترجاع غير صالحة' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: publishRequest } = await service.from('publish_requests').select('id, request_number, client_name, client_email, final_total, admin_quoted_price, payment_method, moyasar_payment_id, tamara_order_id, payment_status').eq('id', requestId).maybeSingle()
  if (!publishRequest) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

  const inferredProvider = publishRequest.moyasar_payment_id ? 'moyasar' : publishRequest.tamara_order_id ? 'tamara' : 'manual'
  if (provider !== inferredProvider) return NextResponse.json({ error: 'وسيلة الاسترجاع لا تطابق وسيلة الدفع المسجلة' }, { status: 422 })

  const { data: pendingRefunds } = await service.from('payment_refunds').select('id').eq('request_id', requestId).eq('status', 'pending')
  if ((pendingRefunds ?? []).length > 0) return NextResponse.json({ error: 'يوجد طلب استرجاع قيد المعالجة لهذا الطلب. أكّده أو عالجه أولاً.' }, { status: 409 })

  const { data: completedRefunds } = await service.from('payment_refunds').select('amount').eq('request_id', requestId).eq('status', 'completed')
  const paidAmount = Number(publishRequest.final_total ?? publishRequest.admin_quoted_price ?? 0)
  const refundedAmount = (completedRefunds ?? []).reduce((total, refund) => total + Number(refund.amount), 0)
  const remaining = Math.round((paidAmount - refundedAmount) * 100) / 100
  if (amount > remaining + 0.001) return NextResponse.json({ error: `المبلغ يتجاوز الرصيد القابل للاسترجاع (${remaining} ر.س)` }, { status: 422 })

  const reference = randomUUID()
  const now = new Date().toISOString()
  let status: 'pending' | 'completed' | 'failed' = provider === 'manual' ? 'pending' : 'failed'
  let providerResponse: any = null
  let providerRefundId: string | null = null

  if (provider === 'moyasar') {
    const result = await refundMoyasarPayment(publishRequest.moyasar_payment_id!, Math.round(amount * 100))
    providerResponse = result.data ?? { error: result.error }
    if (result.success) {
      status = result.data?.status === 'refunded' ? 'completed' : 'pending'
      providerRefundId = result.data?.id ?? reference
    }
  } else if (provider === 'tamara') {
    const result = await refundTamaraOrder(publishRequest.tamara_order_id!, amount, reason, reference)
    providerResponse = result.data ?? { error: result.error }
    if (result.success) {
      // تمارا تؤكد الإتمام النهائي عبر order_refunded؛ نبقيه قيد المعالجة حتى يصل الـWebhook.
      status = 'pending'
      providerRefundId = result.data?.refund_id ?? result.data?.id ?? reference
    }
  }

  const { data: refund, error: insertError } = await service.from('payment_refunds').insert({
    request_id: requestId, provider, provider_payment_id: provider === 'moyasar' ? publishRequest.moyasar_payment_id : publishRequest.tamara_order_id,
    provider_refund_id: providerRefundId, amount, reason, status, requested_by: user.id, requested_at: now,
    processed_at: status === 'completed' ? now : null, provider_response: providerResponse,
  }).select().single()
  if (insertError) return NextResponse.json({ error: 'تعذّر تسجيل عملية الاسترجاع' }, { status: 500 })

  if (status === 'failed') return NextResponse.json({ error: providerResponse?.error ?? 'فشل الاسترجاع لدى مزود الدفع', refund }, { status: 502 })

  const totalAfterRefund = Math.round((refundedAmount + amount) * 100) / 100
  const isFullRefund = totalAfterRefund >= paidAmount - 0.001
  const isPending = status === 'pending'
  // لا نغيّر مسار تنفيذ الطلب في الاسترجاع الجزئي، بينما الاسترجاع الكامل ينتظر تأكيد المزود أو الإدارة.
  const nextStatus = isPending && isFullRefund ? 'refund_pending' : isFullRefund ? 'refunded' : undefined
  const nextPaymentStatus = isPending ? 'refund_pending' : isFullRefund ? 'refunded' : 'partially_refunded'
  await service.from('publish_requests').update({
    ...(nextStatus ? { status: nextStatus } : {}),
    payment_status: nextPaymentStatus,
    refund_amount: totalAfterRefund,
    refund_timing: TIMING[provider],
    refund_requested_at: now,
    updated_at: now,
  }).eq('id', requestId)

  if (publishRequest.client_email) {
    notifyRefundUpdateToClient({
      email: publishRequest.client_email, requestNumber: generateRequestNumber(publishRequest.request_number),
      clientName: publishRequest.client_name ?? 'عميلنا العزيز', amount, timing: TIMING[provider], isPending,
    }).catch(error => console.error('Refund email failed:', error))
  }

  return NextResponse.json({ success: true, refund, timing: TIMING[provider], status, isFullRefund, paymentStatus: nextPaymentStatus })
}
