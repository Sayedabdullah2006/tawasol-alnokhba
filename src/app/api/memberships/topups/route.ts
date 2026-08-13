import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { calculateMembershipTopup } from '@/lib/membership-topups'

export async function POST(request: NextRequest) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'يرجى تسجيل الدخول أولاً' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const membershipId = String(body.membershipId ?? '')
  const itemType = String(body.itemType ?? '')
  const quantity = Number(body.quantity)
  const pricing = calculateMembershipTopup(itemType, quantity)
  if (!membershipId || !pricing) return NextResponse.json({ error: 'بيانات تعزيز الرصيد غير صحيحة' }, { status: 400 })

  const service = await createServiceRoleClient()
  const { data: membership } = await service
    .from('memberships')
    .select('id, user_id, status, ends_at')
    .eq('id', membershipId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'العضوية غير موجودة' }, { status: 404 })
  if (membership.status !== 'active' || !membership.ends_at || new Date(membership.ends_at) <= new Date()) {
    return NextResponse.json({ error: 'تعزيز الرصيد متاح للعضوية النشطة فقط' }, { status: 409 })
  }

  const { data: topup, error } = await service.from('membership_topups').insert({
    membership_id: membership.id,
    user_id: user.id,
    item_type: pricing.item.type,
    quantity: pricing.quantity,
    unit_price: pricing.item.unitPrice,
    unit_budget: pricing.item.unitBudget,
    subtotal: pricing.total,
    vat_amount: 0,
    total_amount: pricing.total,
  }).select('id, topup_number, total_amount').single()

  if (error || !topup) {
    console.error('[MEMBERSHIP_TOPUP] create failed:', error)
    return NextResponse.json({ error: 'تعذر إنشاء عملية تعزيز الرصيد' }, { status: 500 })
  }
  return NextResponse.json({ topup })
}
