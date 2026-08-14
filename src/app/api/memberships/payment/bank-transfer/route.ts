import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { formatMembershipNumber } from '@/lib/memberships'
import { notifyAdminIntake } from '@/lib/email'

export async function POST(request: NextRequest) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { membershipId, receiptUrl } = await request.json().catch(() => ({}))
  if (!membershipId || !receiptUrl) return NextResponse.json({ error: 'إيصال التحويل مطلوب' }, { status: 400 })
  const service = await createServiceRoleClient()
  const { data: membership } = await service.from('memberships').select('*, membership_plans(name_ar)').eq('id', membershipId).eq('user_id', user.id).maybeSingle()
  if (!membership || membership.status !== 'pending_payment') return NextResponse.json({ error: 'العضوية غير جاهزة للدفع' }, { status: 409 })
  const now = new Date().toISOString()
  const { error } = await service.from('memberships').update({ status: 'payment_review', payment_status: 'payment_review', payment_provider: 'bank_transfer', receipt_url: receiptUrl, updated_at: now }).eq('id', membershipId)
  if (error) return NextResponse.json({ error: 'تعذر حفظ إيصال التحويل' }, { status: 500 })
  await service.from('membership_payments').insert({ membership_id: membershipId, provider: 'bank_transfer', amount: membership.total_amount, status: 'pending', provider_response: { receipt_url: receiptUrl } })
  const number = formatMembershipNumber(membership.membership_number)
  void notifyAdminIntake({
    subject: 'تحويل عضوية بانتظار التحقق',
    heading: 'رفع العميل إيصال تحويل ويحتاج تحقق الإدارة',
    referenceNumber: number,
    referenceLabel: 'رقم العضوية',
    clientName: membership.client_name,
    clientEmail: membership.client_email,
    clientPhone: membership.client_phone,
    itemLabel: 'العضوية',
    itemName: membership.membership_plans?.name_ar ?? 'عضوية تواصل النخبة',
    statusLabel: 'بانتظار التحقق من التحويل البنكي',
    amount: Number(membership.total_amount),
    actionLabel: 'مراجعة التحويل',
    actionUrl: 'https://nukhba.media/admin/memberships',
  })
  return NextResponse.json({ success: true })
}
