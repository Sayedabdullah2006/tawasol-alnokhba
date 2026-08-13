import MembershipCheckout from '@/components/memberships/MembershipCheckout'
import { getMembershipPlan } from '@/lib/memberships'

export const metadata = { title: 'اختيار العضوية | تواصل النخبة' }

export default async function MembershipCheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; duration?: string }> }) {
  const query = await searchParams
  const duration = Number(query.duration)
  const safeDuration = duration === 6 || duration === 12 ? duration : 3
  const planId = getMembershipPlan(query.plan ?? '')?.id ?? 'silver'
  return <MembershipCheckout planId={planId} duration={safeDuration} />
}
