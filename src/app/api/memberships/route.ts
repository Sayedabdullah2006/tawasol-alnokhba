import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { formatMembershipNumber, MEMBERSHIP_TERMS_TEXT, MEMBERSHIP_TERMS_VERSION } from '@/lib/memberships'
import { notifyAdminIntake } from '@/lib/email'

const VALID_DURATIONS = new Set([3, 6, 12])

export async function GET() {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const service = await createServiceRoleClient()
  const now = new Date().toISOString()
  await service
    .from('memberships')
    .update({ status: 'expired', updated_at: now })
    .eq('user_id', user.id)
    .in('status', ['active', 'paused'])
    .lte('ends_at', now)

  const { data, error } = await service
    .from('memberships')
    .select('*, membership_plans(*), membership_plan_prices(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'تعذر تحميل العضويات' }, { status: 500 })
  return NextResponse.json({ memberships: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'يرجى تسجيل الدخول أولاً' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const planId = String(body.planId ?? '')
  const durationMonths = Number(body.durationMonths)
  const clientName = String(body.clientName ?? '').trim()
  const clientPhone = String(body.clientPhone ?? '').trim()
  const acceptedTerms = body.acceptedTerms === true
  const acceptedPrivacy = body.acceptedPrivacy === true

  if (!planId || !VALID_DURATIONS.has(durationMonths) || clientName.length < 2) {
    return NextResponse.json({ error: 'بيانات العضوية غير مكتملة' }, { status: 400 })
  }
  if (!acceptedTerms || !acceptedPrivacy) {
    return NextResponse.json({ error: 'يجب الموافقة على الشروط وسياسة الخصوصية' }, { status: 400 })
  }

  const service = await createServiceRoleClient()
  const expirationCheckAt = new Date().toISOString()
  await service
    .from('memberships')
    .update({ status: 'expired', updated_at: expirationCheckAt })
    .eq('user_id', user.id)
    .in('status', ['active', 'paused'])
    .lte('ends_at', expirationCheckAt)

  const [{ data: plan }, { data: price }] = await Promise.all([
    service.from('membership_plans').select('*').eq('id', planId).eq('active', true).maybeSingle(),
    service.from('membership_plan_prices').select('*').eq('plan_id', planId).eq('duration_months', durationMonths).eq('active', true).maybeSingle(),
  ])

  if (!plan || !price) return NextResponse.json({ error: 'الخطة المختارة غير متاحة حالياً' }, { status: 404 })

  const { data: activeMembership } = await service
    .from('memberships')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['active', 'paused', 'payment_review'])
    .limit(1)
    .maybeSingle()
  if (activeMembership) {
    return NextResponse.json({ error: activeMembership.status === 'payment_review' ? 'لديك تحويل عضوية ينتظر تحقق الإدارة.' : 'لديك عضوية قائمة بالفعل. يمكنك إدارتها من صفحة عضويتي.', membershipId: activeMembership.id }, { status: 409 })
  }

  const { data: profile } = await service.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle()
  const email = user.email ?? ''
  if (!email) return NextResponse.json({ error: 'لا يوجد بريد إلكتروني مرتبط بالحساب' }, { status: 400 })

  const forwarded = request.headers.get('x-forwarded-for')
  const acceptanceIp = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
  const now = new Date().toISOString()

  const { data: existingPending } = await service
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const payload = {
    user_id: user.id,
    plan_id: plan.id,
    plan_price_id: price.id,
    duration_months: durationMonths,
    status: 'pending_payment',
    client_name: clientName || profile?.full_name || 'عميل تواصل النخبة',
    client_email: email,
    client_phone: clientPhone || profile?.phone || null,
    subtotal: price.total_amount,
    vat_amount: 0,
    total_amount: price.total_amount,
    payment_status: 'pending',
    terms_version: MEMBERSHIP_TERMS_VERSION,
    terms_snapshot: MEMBERSHIP_TERMS_TEXT,
    terms_accepted_at: now,
    privacy_accepted_at: now,
    acceptance_ip: acceptanceIp,
    acceptance_user_agent: request.headers.get('user-agent'),
    updated_at: now,
  }

  const query = existingPending
    ? service.from('memberships').update(payload).eq('id', existingPending.id)
    : service.from('memberships').insert(payload)
  const { data: membership, error } = await query.select('id, membership_number, total_amount').single()

  if (error || !membership) {
    console.error('[MEMBERSHIP] create failed:', error)
    return NextResponse.json({ error: 'تعذر إنشاء العضوية، حاول مجدداً' }, { status: 500 })
  }

  await notifyAdminIntake({
    subject: 'طلب عضوية جديد',
    heading: 'أنشأ عميل طلب عضوية جديداً',
    referenceNumber: formatMembershipNumber(membership.membership_number),
    referenceLabel: 'رقم العضوية',
    clientName: payload.client_name,
    clientEmail: email,
    clientPhone: payload.client_phone,
    itemLabel: 'العضوية',
    itemName: `${plan.name_ar} · ${durationMonths} أشهر`,
    statusLabel: 'بانتظار إتمام الدفع',
    amount: Number(membership.total_amount),
    actionLabel: 'فتح إدارة العضويات',
    actionUrl: 'https://nukhba.media/admin/memberships',
  })

  return NextResponse.json({ membership })
}
