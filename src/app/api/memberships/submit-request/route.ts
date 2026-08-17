import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'
import { notifyRequestReceivedToClient } from '@/lib/email'
import { CATEGORIES } from '@/lib/constants'
import { normalizeImageUrls, normalizeSupportingDocuments } from '@/lib/request-attachments'
import {
  membershipBenefitSelectionLabel,
  type MembershipBenefitSelection,
  type MembershipBenefitType,
} from '@/lib/memberships'

const VALID_BENEFITS = new Set<MembershipBenefitType>(['reshare_quote', 'pin', 'paid_campaign'])

function normalizeBenefit(value: unknown): MembershipBenefitSelection | null {
  if (!value || typeof value !== 'object') return null
  const item = value as { type?: unknown; settings?: unknown }
  const type = String(item.type ?? '') as MembershipBenefitType
  if (!VALID_BENEFITS.has(type)) return null
  const settings = item.settings && typeof item.settings === 'object'
    ? item.settings as MembershipBenefitSelection['settings']
    : {}
  if (type === 'reshare_quote') {
    if (!['reshare', 'quote'].includes(String(settings.action)) || ![1, 2].includes(Number(settings.delay_days))) return null
    return { type, settings: { action: settings.action, delay_days: Number(settings.delay_days) as 1 | 2 } }
  }
  if (type === 'pin') return { type, settings: { duration_hours: 6 } }
  return { type, settings: {} }
}

export async function POST(request: NextRequest) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'يرجى تسجيل الدخول' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const membershipId = String(body.membership_id ?? '')
  const rawBenefits: unknown[] = Array.isArray(body.membership_benefits) ? body.membership_benefits : []
  const normalizedBenefits = rawBenefits.map(normalizeBenefit)
  if (normalizedBenefits.some(item => item === null)) {
    return NextResponse.json({ error: 'إعدادات إحدى مزايا العضوية غير مكتملة' }, { status: 400 })
  }
  const requestedBenefits = normalizedBenefits.filter((item): item is MembershipBenefitSelection => item !== null)
  if (new Set(requestedBenefits.map(item => item.type)).size !== requestedBenefits.length) {
    return NextResponse.json({ error: 'لا يمكن تكرار الميزة نفسها في الطلب' }, { status: 400 })
  }
  if (!membershipId || body.request_type === 'campaign') return NextResponse.json({ error: 'رصيد العضوية مخصص حالياً لمنشور واحد لكل طلب' }, { status: 400 })
  if (!body.influencer_id || !body.category || !body.title || !body.content || !body.client_name || !body.client_phone || !body.client_email) {
    return NextResponse.json({ error: 'بيانات الطلب غير مكتملة' }, { status: 400 })
  }

  const service = await createServiceRoleClient()
  const { data: membership } = await service.from('memberships').select('id, status, user_id, starts_at, ends_at, plan_id').eq('id', membershipId).eq('user_id', user.id).maybeSingle()
  if (!membership || membership.status !== 'active') return NextResponse.json({ error: 'العضوية غير نشطة' }, { status: 409 })
  if (!membership.ends_at || new Date(membership.ends_at) <= new Date()) return NextResponse.json({ error: 'انتهت مدة العضوية' }, { status: 409 })
  const membershipClientType = membership.plan_id === 'corporate' ? 'business' : 'individual'
  if (membershipClientType === 'business' && !String(body.org_name ?? '').trim()) {
    return NextResponse.json({ error: 'اسم الشركة أو المؤسسة مطلوب لعضوية الشركات' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const channels = Array.isArray(body.channels) ? body.channels : []
  const benefitSummary = requestedBenefits.map(membershipBenefitSelectionLabel)
  const { data: row, error } = await service.from('publish_requests').insert({
    user_id: user.id,
    influencer_id: body.influencer_id,
    client_type: membershipClientType,
    org_name: membershipClientType === 'business' ? String(body.org_name).trim() : null,
    org_representative: membershipClientType === 'business' ? (String(body.org_representative ?? '').trim() || null) : null,
    org_license: membershipClientType === 'business' ? (String(body.org_license ?? '').trim() || null) : null,
    category: body.category,
    sub_option: body.sub_option ? (typeof body.sub_option === 'object' ? JSON.stringify(body.sub_option) : body.sub_option) : null,
    channels,
    scope: channels.length > 1 ? 'all' : 'single',
    images: 'one',
    extras: [],
    num_posts: 1,
    title: body.title,
    content: body.content,
    link: body.link ?? null,
    hashtags: body.hashtags ?? null,
    preferred_date: body.preferred_date ?? null,
    content_images: normalizeImageUrls(body.content_images),
    supporting_documents: normalizeSupportingDocuments(body.supporting_documents),
    client_name: body.client_name,
    client_phone: body.client_phone,
    client_email: body.client_email,
    client_city: body.client_city ?? null,
    x_handle: body.x_handle ?? null,
    request_type: 'single',
    billing_source: 'membership',
    membership_id: membershipId,
    membership_credits: 1,
    membership_credit_status: 'none',
    base_price: 0,
    extras_total: 0,
    vat_amount: 0,
    total_amount: 0,
    final_total: 0,
    status: 'pending',
    payment_status: 'paid',
    paid_at: membership.starts_at ?? now,
    auto_quote_note: benefitSummary.length > 0
      ? `طلب عضوية قيد مراجعة الإدارة · الرصيد والمزايا محجوزة مؤقتاً: ${benefitSummary.join('، ')}`
      : 'طلب عضوية قيد مراجعة الإدارة · تم حجز رصيد منشور واحد مؤقتاً',
    last_status_change: now,
    updated_at: now,
  }).select('id, request_number').single()
  if (error || !row) return NextResponse.json({ error: 'تعذر حفظ الطلب' }, { status: 500 })

  const { error: reserveError } = await service.rpc('reserve_membership_credit', { p_membership_id: membershipId, p_request_id: row.id, p_credits: 1 })
  if (reserveError) {
    await service.from('publish_requests').delete().eq('id', row.id)
    const message = reserveError.message.includes('concurrent') ? 'وصلت إلى الحد الأقصى للطلبات المتزامنة في عضويتك' : reserveError.message.includes('insufficient') ? 'لا يوجد رصيد كافٍ في عضويتك' : 'تعذر حجز رصيد العضوية'
    return NextResponse.json({ error: message }, { status: 409 })
  }
  if (requestedBenefits.length > 0) {
    const { error: benefitError } = await service.rpc('reserve_membership_benefits', { p_request_id: row.id, p_benefits: requestedBenefits })
    if (benefitError) {
      await service.rpc('release_membership_credit', { p_request_id: row.id, p_note: 'إلغاء حجز الطلب لتعذر حجز المزايا المختارة' })
      await service.from('publish_requests').delete().eq('id', row.id)
      return NextResponse.json({ error: 'إحدى المزايا المختارة لم تعد متاحة. حدّث الصفحة وحاول مجدداً.' }, { status: 409 })
    }
  }

  const requestNumber = generateRequestNumber(row.request_number)
  const category = CATEGORIES.find(item => item.id === body.category)?.nameAr ?? body.category
  const emailData = { requestNumber, clientName: body.client_name, clientEmail: body.client_email, clientPhone: body.client_phone, category, title: body.title, content: body.content, channels }
  notifyRequestReceivedToClient({ ...emailData, requestId: row.id }).catch(error => console.error('[MEMBERSHIP] client email:', error))
  const [{ data: wallet }, { data: benefitWallets }] = await Promise.all([
    service.from('membership_credit_wallets').select('total_credits, reserved_credits, used_credits').eq('membership_id', membershipId).maybeSingle(),
    service.from('membership_benefit_wallets').select('benefit_type, total_units, reserved_units, used_units').eq('membership_id', membershipId),
  ])
  return NextResponse.json({
    id: row.id,
    requestNumber,
    membershipBalance: wallet ? wallet.total_credits - wallet.reserved_credits - wallet.used_credits : null,
    benefitBalances: (benefitWallets ?? []).map(item => ({
      type: item.benefit_type,
      remaining: item.total_units - item.reserved_units - item.used_units,
    })),
  })
}
