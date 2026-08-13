import Sidebar from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type ActiveMembership = {
  id: string
  plan_id: string
  status: string
  membership_plans: { id: string; name_ar: string } | null
}

const standardDashboardNav = [
  { href: '/dashboard', label: 'طلباتي', icon: '📋' },
  { href: '/request/start', label: 'طلب جديد', icon: '➕' },
  { href: '/dashboard/membership', label: 'عضويتي', icon: '★' },
  { href: '/dashboard/profile', label: 'الملف الشخصي', icon: '👤' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  let membership: ActiveMembership | null = null

  if (user) {
    const service = await createServiceRoleClient()
    const { data } = await service
      .from('memberships')
      .select('id, plan_id, status, membership_plans(id, name_ar)')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .gt('ends_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    membership = data as unknown as ActiveMembership | null
  }

  const membershipNav = membership ? [
    { href: '/dashboard/membership', label: 'ملخص العضوية', icon: '★' },
    ...(membership.status === 'active'
      ? [
          { href: `/dashboard/membership/request?membership=${membership.id}`, label: 'طلب من الرصيد', icon: '＋' },
          { href: '/dashboard/membership/topup', label: 'تعزيز رصيد العضوية', icon: '⊕' },
        ]
      : []),
    { href: '/dashboard/membership/magazine', label: 'مجلتي', icon: '▣' },
    { href: '/dashboard', label: 'طلباتي', icon: '📋' },
    {
      label: 'تفاصيل العضوية',
      icon: '◫',
      children: [
        { href: '/dashboard/membership#membership-balance', label: 'الرصيد المتاح', icon: '◉' },
        { href: '/dashboard/membership#membership-benefits', label: 'المزايا', icon: '✓' },
        { href: '/dashboard/membership#membership-plan', label: 'الخطة والمخرجات', icon: '▤' },
        { href: '/dashboard/membership#membership-ledger', label: 'سجل الاستخدام', icon: '↻' },
      ],
    },
    { href: `/api/memberships/${membership.id}/contract`, label: 'عقد العضوية', icon: '↓' },
    { href: '/request?direct=1', label: 'طلب مباشر خارج الرصيد', icon: '↗' },
    { href: '/dashboard/profile', label: 'الملف الشخصي', icon: '👤' },
  ] : standardDashboardNav

  const mobileNav = membership ? [
    { href: '/dashboard/membership', label: 'عضويتي', icon: '★' },
    ...(membership.status === 'active'
      ? [
          { href: `/dashboard/membership/request?membership=${membership.id}`, label: 'طلب من الرصيد', icon: '＋' },
          { href: '/dashboard/membership/topup', label: 'تعزيز الرصيد', icon: '⊕' },
        ]
      : []),
    { href: '/dashboard/membership/magazine', label: 'مجلتي', icon: '▣' },
    { href: '/dashboard', label: 'طلباتي', icon: '📋' },
    { href: '/request?direct=1', label: 'طلب مباشر', icon: '↗' },
    { href: '/dashboard/profile', label: 'حسابي', icon: '👤' },
  ] : standardDashboardNav

  return (
    <div className="flex flex-1 w-full min-h-0">
      <Sidebar
        items={membershipNav}
        title={membership?.membership_plans?.name_ar ?? 'لوحة التحكم'}
        membershipPlanId={membership?.plan_id ?? membership?.membership_plans?.id}
      />
      <div className="flex-1 pb-20 md:pb-0 min-w-0 overflow-hidden">
        <div className="h-full w-full p-4 md:p-6 overflow-auto">
          {children}
        </div>
      </div>
      <BottomNav items={mobileNav} />
    </div>
  )
}
