import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createTamaraMembershipCheckoutSession } from '@/lib/tamara-server'

export async function POST(request: NextRequest) {
  const { membershipId } = await request.json().catch(() => ({}))
  if (!membershipId) return NextResponse.json({ error: 'معرف العضوية مطلوب' }, { status: 400 })
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: membership } = await auth.from('memberships').select('id, user_id, status').eq('id', membershipId).maybeSingle()
  if (!membership || membership.user_id !== user.id) return NextResponse.json({ error: 'العضوية غير موجودة' }, { status: 404 })
  if (membership.status !== 'pending_payment') return NextResponse.json({ error: 'العضوية غير جاهزة للدفع' }, { status: 409 })
  const result = await createTamaraMembershipCheckoutSession(membershipId)
  return NextResponse.json(result, { status: result.success ? 200 : 502 })
}
