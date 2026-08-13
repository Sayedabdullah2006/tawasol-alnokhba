import { cn } from '@/lib/utils'

type BadgeSize = 'sm' | 'md' | 'lg'

const BADGES = {
  silver: {
    icon: '✦',
    label: 'وسام العضوية الفضية',
    disc: 'border-[#b8c2cf] bg-[#e9edf2] text-[#536171]',
    ribbon: 'bg-[#9ca8b8]',
  },
  gold: {
    icon: '★',
    label: 'وسام العضوية الذهبية',
    disc: 'border-[#c9a44f] bg-[#efd47f] text-[#6a4a08]',
    ribbon: 'bg-[#b98d32]',
  },
  platinum: {
    icon: '◆',
    label: 'وسام العضوية البلاتينية',
    disc: 'border-[#82b9c8] bg-[#e0f5f8] text-[#15576b]',
    ribbon: 'bg-[#4e91a5]',
  },
  corporate: {
    icon: '▦',
    label: 'وسام عضوية الشركات',
    disc: 'border-[#77b9a9] bg-[#dff2ec] text-[#155f50]',
    ribbon: 'bg-[#3f8f7d]',
  },
} as const

const SIZES: Record<BadgeSize, { wrap: string; disc: string; icon: string; ribbon: string }> = {
  sm: { wrap: 'h-8 w-8', disc: 'h-7 w-7 border-2', icon: 'text-xs', ribbon: 'h-3 w-1.5' },
  md: { wrap: 'h-11 w-11', disc: 'h-9 w-9 border-2', icon: 'text-base', ribbon: 'h-4 w-2' },
  lg: { wrap: 'h-16 w-16', disc: 'h-13 w-13 border-[3px]', icon: 'text-xl', ribbon: 'h-5 w-2.5' },
}

export function resolveMembershipPlanId(planId?: string | null, planName?: string | null) {
  if (planId && planId in BADGES) return planId as keyof typeof BADGES
  const name = planName ?? ''
  if (name.includes('بلاتين')) return 'platinum'
  if (name.includes('ذهب')) return 'gold'
  if (name.includes('فض')) return 'silver'
  if (name.includes('شرك')) return 'corporate'
  return 'silver'
}

export default function MembershipPlanBadge({
  planId,
  planName,
  size = 'md',
  className,
}: {
  planId?: string | null
  planName?: string | null
  size?: BadgeSize
  className?: string
}) {
  const id = resolveMembershipPlanId(planId, planName)
  const badge = BADGES[id]
  const dimensions = SIZES[size]

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-start justify-center', dimensions.wrap, className)}
      role="img"
      aria-label={badge.label}
      title={badge.label}
    >
      <span aria-hidden className={cn('absolute bottom-0 right-[28%] rotate-[18deg] rounded-b-sm', dimensions.ribbon, badge.ribbon)} />
      <span aria-hidden className={cn('absolute bottom-0 left-[28%] -rotate-[18deg] rounded-b-sm', dimensions.ribbon, badge.ribbon)} />
      <span aria-hidden className={cn('relative z-10 grid place-items-center rounded-full shadow-sm ring-2 ring-white/70', dimensions.disc, dimensions.icon, badge.disc)}>
        {badge.icon}
      </span>
    </span>
  )
}
