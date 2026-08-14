import { buildAuthHeader, MOYASAR_API_URL, toSAR } from '@/lib/moyasar'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { formatMembershipTopupNumber, getMembershipTopupItem } from '@/lib/membership-topups'
import { notifyAdminIntake, sendEmail } from '@/lib/email'

async function sendTopupReceipt(topup: any) {
  const service = await createServiceRoleClient()
  const now = new Date().toISOString()
  const { data: claimed } = await service.from('membership_topups')
    .update({ receipt_sent_at: now })
    .eq('id', topup.id)
    .is('receipt_sent_at', null)
    .select('id')
    .maybeSingle()
  if (!claimed) return

  const item = getMembershipTopupItem(topup.item_type)
  const number = formatMembershipTopupNumber(topup.topup_number)
  const dashboard = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/membership`
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#102b5c">
    <div style="max-width:620px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce3ef">
      <div style="background:#102b5c;padding:28px;color:#fff;text-align:right"><h1 style="margin:0;font-size:24px">تم تعزيز رصيد عضويتك</h1><p style="margin:8px 0 0;color:#d4b66f">${number}</p></div>
      <div style="padding:28px;text-align:right;line-height:1.9"><p>مرحباً ${topup.memberships?.client_name ?? 'عميلنا العزيز'}،</p><p>اكتمل السداد، وأضيفت <strong>${topup.quantity} × ${item?.shortLabel ?? 'ميزة إضافية'}</strong> إلى عضويتك.</p>
      <div style="background:#f7f9fd;border-right:4px solid #c9a961;padding:16px;margin:20px 0"><strong>الإجمالي:</strong> ${Number(topup.total_amount).toLocaleString('ar-SA')} ر.س<br/><strong>الصلاحية:</strong> حتى نهاية العضوية الحالية.</div>
      <p style="text-align:center"><a href="${dashboard}" style="display:inline-block;background:#14366e;color:white;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">عرض الرصيد</a></p></div>
    </div></div>`
  try {
    const sent = await sendEmail(topup.memberships?.client_email, `تم تعزيز رصيد عضويتك · ${number}`, html)
    if (!sent) throw new Error('Email provider did not confirm delivery')
    await notifyAdminIntake({
      subject: 'تم دفع تعزيز رصيد عضوية',
      heading: 'اكتمل دفع رصيد أو ميزة إضافية لعضوية',
      referenceNumber: number,
      referenceLabel: 'رقم العملية',
      clientName: topup.memberships?.client_name ?? 'عميل تواصل النخبة',
      clientEmail: topup.memberships?.client_email ?? '',
      itemLabel: 'الإضافة',
      itemName: `${topup.quantity} × ${item?.shortLabel ?? 'ميزة إضافية'}`,
      statusLabel: 'مدفوعة وأضيفت إلى رصيد العضوية',
      amount: Number(topup.total_amount),
      actionLabel: 'فتح إدارة العضويات',
      actionUrl: 'https://nukhba.media/admin/memberships',
    })
  } catch (error) {
    await service.from('membership_topups').update({ receipt_sent_at: null }).eq('id', topup.id)
    console.error('[MEMBERSHIP_TOPUP] receipt email failed:', error)
  }
}

export async function applyPaidMembershipTopup(args: { topupId: string; provider: 'moyasar' | 'tamara'; providerPaymentId: string; providerResponse: unknown }) {
  const service = await createServiceRoleClient()
  const { data, error } = await service.rpc('apply_membership_topup', {
    p_topup_id: args.topupId,
    p_provider: args.provider,
    p_provider_payment_id: args.providerPaymentId,
    p_provider_response: args.providerResponse,
  })
  if (error) return { success: false, reason: error.message }
  const topup = Array.isArray(data) ? data[0] : data
  const { data: details } = await service.from('membership_topups')
    .select('*, memberships(client_name, client_email)')
    .eq('id', args.topupId)
    .single()
  if (details) void sendTopupReceipt(details)
  return { success: true, reason: 'verified_and_applied', topup: topup ?? details }
}

export async function verifyAndApplyMembershipTopup(paymentId: string, topupId?: string) {
  const service = await createServiceRoleClient()
  const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, { headers: { Authorization: buildAuthHeader(), 'Content-Type': 'application/json' } })
  const payment = await response.json().catch(() => ({}))
  if (!response.ok) return { success: false, reason: payment.message ?? 'تعذر التحقق من الدفعة' }
  const metadataTopupId = String(payment.metadata?.topup_id ?? '')
  if (!metadataTopupId || payment.metadata?.resource_type !== 'membership_topup') return { success: false, reason: 'بيانات عملية التعزيز غير موجودة في الدفعة' }
  if (topupId && topupId !== metadataTopupId) return { success: false, reason: 'معرف عملية التعزيز لا يطابق بيانات الدفعة' }
  const targetId = metadataTopupId

  const { data: topup } = await service.from('membership_topups').select('*').eq('id', targetId).maybeSingle()
  if (!topup) return { success: false, reason: 'عملية تعزيز الرصيد غير موجودة' }
  if (topup.status === 'paid') return { success: true, reason: 'already_processed', payment, topup }
  if (payment.status !== 'paid') return { success: true, reason: 'payment_not_paid', payment, topup }
  const expected = Math.round(Number(topup.total_amount) * 100)
  if (payment.amount !== expected) return { success: false, reason: `مبلغ الدفع غير مطابق: المتوقع ${topup.total_amount} ر.س والمستلم ${toSAR(payment.amount)} ر.س` }
  if (payment.currency !== 'SAR') return { success: false, reason: 'عملة الدفع غير صحيحة' }
  return applyPaidMembershipTopup({ topupId: targetId, provider: 'moyasar', providerPaymentId: payment.id, providerResponse: payment })
}
