import { buildAuthHeader, MOYASAR_API_URL, toSAR } from '@/lib/moyasar'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateMembershipContractPdf, type ContractMembership } from '@/lib/membership-contract'
import { formatMembershipNumber, getMembershipPlan } from '@/lib/memberships'
import { sendEmail } from '@/lib/email'

function membershipEmailHtml(args: { name: string; plan: string; number: string; months: number; total: number }) {
  const dashboard = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/membership`
  return `<div dir="rtl" style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#102b5c">
    <div style="max-width:620px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce3ef">
      <div style="background:#102b5c;padding:30px;color:#fff;text-align:right"><h1 style="margin:0;font-size:25px">تم تفعيل عضويتك</h1><p style="margin:8px 0 0;color:#d4b66f">${args.number}</p></div>
      <div style="padding:30px;text-align:right;line-height:1.9"><p>مرحباً ${args.name}،</p><p>اكتمل سداد وتفعيل <strong>${args.plan}</strong> لمدة ${args.months} أشهر. أصبح رصيد العضوية الكامل ومزايا باقتك جاهزة، ويمكنك الآن رفع طلباتك من صفحة عضويتي.</p>
      <div style="background:#f7f9fd;border-right:4px solid #c9a961;padding:16px;margin:22px 0"><strong>المبلغ المدفوع:</strong> ${args.total.toLocaleString('ar-SA')} ر.س<br/><strong>العقد:</strong> مرفق بهذه الرسالة ومحفوظ في حسابك.</div>
      <p style="text-align:center"><a href="${dashboard}" style="display:inline-block;background:#14366e;color:white;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">فتح عضويتي</a></p>
      <p style="color:#71809a;font-size:13px">نتطلع لأن نكون معك في إنجازك القادم، وفي كل خطوة تستحق أن تصل.</p></div>
    </div></div>`
}

type ActivatedMembership = ContractMembership & {
  id: string
  user_id: string
}

export async function finishMembershipActivation(membership: ActivatedMembership) {
  const service = await createServiceRoleClient()
  const plan = getMembershipPlan(membership.plan_id)
  const number = formatMembershipNumber(membership.membership_number)
  try {
    const pdf = await generateMembershipContractPdf(membership)
    const path = `${membership.user_id}/${membership.id}/${number}.pdf`
    const { error: uploadError } = await service.storage.from('membership-contracts').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    const now = new Date().toISOString()
    await Promise.all([
      service.from('memberships').update({ contract_path: path, contract_generated_at: now }).eq('id', membership.id),
      service.from('membership_agreements').update({ contract_path: path, contract_generated_at: now }).eq('membership_id', membership.id).eq('version', membership.terms_version),
    ])
    await sendEmail(membership.client_email, `تم تفعيل ${plan?.name ?? 'عضويتك'} · ${number}`, membershipEmailHtml({
      name: membership.client_name,
      plan: plan?.name ?? 'عضوية تواصل النخبة',
      number,
      months: membership.duration_months,
      total: Number(membership.total_amount),
    }), [{ filename: `${number}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }])
  } catch (error) {
    console.error('[MEMBERSHIP] contract/email failed:', error)
  }
}

export async function verifyAndActivateMembership(paymentId: string, membershipId?: string) {
  const service = await createServiceRoleClient()
  const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, { headers: { Authorization: buildAuthHeader(), 'Content-Type': 'application/json' } })
  const payment = await response.json().catch(() => ({}))
  if (!response.ok) return { success: false, reason: payment.message ?? 'تعذر التحقق من الدفعة' }
  const metadataMembershipId = String(payment.metadata?.membership_id ?? '')
  if (!metadataMembershipId || payment.metadata?.resource_type !== 'membership') return { success: false, reason: 'بيانات العضوية غير موجودة في الدفعة' }
  if (membershipId && membershipId !== metadataMembershipId) return { success: false, reason: 'معرف العضوية لا يطابق بيانات الدفعة' }
  const targetId = metadataMembershipId

  const { data: membership } = await service.from('memberships').select('*').eq('id', targetId).maybeSingle()
  if (!membership) return { success: false, reason: 'العضوية غير موجودة' }
  if (membership.status === 'active' && membership.payment_status === 'paid') return { success: true, reason: 'already_processed', payment, membership }
  if (payment.status !== 'paid') return { success: true, reason: 'payment_not_paid', payment }
  const expected = Math.round(Number(membership.total_amount) * 100)
  if (payment.amount !== expected) return { success: false, reason: `مبلغ الدفع غير مطابق: المتوقع ${membership.total_amount} ر.س والمستلم ${toSAR(payment.amount)} ر.س` }
  if (payment.currency !== 'SAR') return { success: false, reason: 'عملة الدفع غير صحيحة' }

  const { data: activated, error } = await service.rpc('activate_membership', {
    p_membership_id: targetId,
    p_provider: 'moyasar',
    p_provider_payment_id: payment.id,
    p_provider_response: payment,
  })
  if (error) return { success: false, reason: error.message }
  const activeMembership = Array.isArray(activated) ? activated[0] : activated
  if (activeMembership) void finishMembershipActivation(activeMembership)
  return { success: true, reason: 'verified_and_activated', payment, membership: activeMembership }
}
