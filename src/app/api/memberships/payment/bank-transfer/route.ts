import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { formatMembershipNumber } from '@/lib/memberships'
import { sendEmail } from '@/lib/email'

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
  void sendEmail('first1saudi@gmail.com', `تحويل عضوية بانتظار التحقق · ${number}`, `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>تحويل عضوية بانتظار التحقق</h2><p>العميل: ${membership.client_name}</p><p>العضوية: ${membership.membership_plans?.name_ar}</p><p>المبلغ: ${membership.total_amount} ر.س</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/memberships">مراجعة العضوية</a></p></div>`)
  return NextResponse.json({ success: true })
}
