import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { verifyAndApplyMembershipTopup } from '@/lib/membership-topup-payment'

export async function GET(request: NextRequest) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const paymentId = request.nextUrl.searchParams.get('id') ?? ''
  const topupId = request.nextUrl.searchParams.get('topupId') ?? ''
  const service = await createServiceRoleClient()
  const { data: topup } = await service.from('membership_topups').select('id').eq('id', topupId).eq('user_id', user.id).maybeSingle()
  if (!paymentId || !topup) return NextResponse.json({ error: 'بيانات الدفعة غير مكتملة' }, { status: 400 })
  const result = await verifyAndApplyMembershipTopup(paymentId, topupId)
  return NextResponse.json(result, { status: result.success ? 200 : 409 })
}
