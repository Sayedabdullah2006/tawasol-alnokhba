import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import MembershipTopupShop from '@/components/memberships/MembershipTopupShop'
import type { MembershipTopupItemType } from '@/lib/membership-topups'

export const dynamic = 'force-dynamic'

export default async function MembershipTopupPage() {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard/membership/topup')

  const service = await createServiceRoleClient()
  const { data: membership } = await service.from('memberships')
    .select('id, ends_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gt('ends_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/dashboard/membership')

  const [{ data: wallet }, { data: benefitWallets }] = await Promise.all([
    service.from('membership_credit_wallets').select('*').eq('membership_id', membership.id).maybeSingle(),
    service.from('membership_benefit_wallets').select('*').eq('membership_id', membership.id),
  ])
  const balances: Record<MembershipTopupItemType, number> = {
    publication_credit: wallet ? wallet.total_credits - wallet.reserved_credits - wallet.used_credits : 0,
    reshare_quote: 0,
    pin: 0,
    paid_campaign: 0,
  }
  for (const item of benefitWallets ?? []) balances[item.benefit_type as MembershipTopupItemType] = item.total_units - item.reserved_units - item.used_units

  return <MembershipTopupShop membership={membership} balances={balances} />
}
