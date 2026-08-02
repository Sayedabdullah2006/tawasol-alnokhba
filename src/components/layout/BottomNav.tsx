'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: string
}

interface BottomNavProps {
  items: NavItem[]
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
      <div className="overflow-x-auto overscroll-x-contain touch-pan-x" dir="rtl" aria-label="التنقل الإداري">
        <div className="flex w-max min-w-full gap-1 px-2 py-2 snap-x snap-proximity">
          {items.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex w-[76px] shrink-0 snap-start flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-all',
                  isActive ? 'bg-green/10 text-green' : 'text-muted'
                )}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="w-full truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
