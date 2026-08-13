import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const service = await createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle()
  let query = service.from('memberships').select('*, membership_plans(*), membership_plan_prices(*)').eq('id', id)
  if (profile?.role !== 'admin') query = query.eq('user_id', user.id)
  const { data, error } = await query.maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'العضوية غير موجودة' }, { status: 404 })

  const [{ data: wallet }, { data: benefitWallets }, { data: ledger }, { data: benefitLedger }, { data: deliverables }, { data: topups }] = await Promise.all([
    service.from('membership_credit_wallets').select('*').eq('membership_id', id).maybeSingle(),
    service.from('membership_benefit_wallets').select('*').eq('membership_id', id).order('benefit_type'),
    service.from('membership_credit_ledger').select('*, publish_requests(request_number, title)').eq('membership_id', id).order('created_at', { ascending: false }),
    service.from('membership_benefit_ledger').select('*, publish_requests(request_number, title)').eq('membership_id', id).order('created_at', { ascending: false }),
    service.from('membership_deliverables').select('*').eq('membership_id', id).order('due_at'),
    service.from('membership_topups').select('*').eq('membership_id', id).order('created_at', { ascending: false }),
  ])
  return NextResponse.json({ membership: data, wallet, benefitWallets: benefitWallets ?? [], ledger: ledger ?? [], benefitLedger: benefitLedger ?? [], deliverables: deliverables ?? [], topups: topups ?? [] })
}
