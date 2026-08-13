import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const service = await createServiceRoleClient()
  const { data, error } = await service.from('membership_topups')
    .select('*, memberships(id, user_id, ends_at, membership_number, membership_plans(name_ar))')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'عملية تعزيز الرصيد غير موجودة' }, { status: 404 })
  return NextResponse.json({ topup: data })
}
