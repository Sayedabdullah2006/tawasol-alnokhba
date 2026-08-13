import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { createTamaraMembershipTopupCheckoutSession } from '@/lib/tamara-server'

export async function POST(request: NextRequest) {
  const { topupId } = await request.json().catch(() => ({}))
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const service = await createServiceRoleClient()
  const { data: topup } = await service.from('membership_topups').select('id').eq('id', topupId).eq('user_id', user.id).maybeSingle()
  if (!topup) return NextResponse.json({ error: 'عملية تعزيز الرصيد غير موجودة' }, { status: 404 })
  const result = await createTamaraMembershipTopupCheckoutSession(topup.id)
  return NextResponse.json(result, { status: result.success ? 200 : 502 })
}
