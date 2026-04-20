'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarItem {
  href: string
  label: string
  icon: string
}

interface SidebarProps {
  items: SidebarItem[]
  title: string
}

export default function Sidebar({ items, title }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-60 bg-card border-l border-border min-h-[calc(100vh-80px)] sticky top-20">
      <div className="p-4 border-b border-border">
        <h2 className="font-black text-dark text-sm">{title}</h2>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(item => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-green/10 text-green'
                  : 'text-dark/70 hover:bg-cream hover:text-dark'
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
