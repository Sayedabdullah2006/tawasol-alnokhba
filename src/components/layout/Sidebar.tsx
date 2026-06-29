'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'

// ورقة (رابط مباشر) أو قسم رئيسي يحوي روابط فرعية → قائمة شجرية.
export interface NavLeaf {
  href: string
  label: string
  icon: string
}
export interface NavGroup {
  label: string
  icon: string
  children: NavLeaf[]
}
export type NavEntry = NavLeaf | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).children !== undefined
}

interface SidebarProps {
  items: NavEntry[]
  title: string
}

export default function Sidebar({ items, title }: SidebarProps) {
  const pathname = usePathname()

  // الأقسام مفتوحة افتراضياً (شجرة واضحة كاملة)، مع إمكانية الطيّ.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (label: string) =>
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }))

  return (
    <aside className="hidden md:flex flex-col w-60 bg-card border-l border-border min-h-[calc(100vh-80px)] sticky top-20">
      <div className="p-4 border-b border-border">
        <h2 className="font-black text-dark text-sm">{title}</h2>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map(entry =>
          isGroup(entry) ? (
            <Group
              key={entry.label}
              group={entry}
              pathname={pathname}
              open={!collapsed[entry.label]}
              onToggle={() => toggle(entry.label)}
            />
          ) : (
            <LeafLink key={entry.href} item={entry} active={pathname === entry.href} />
          )
        )}
      </nav>
    </aside>
  )
}

function Group({
  group,
  pathname,
  open,
  onToggle,
}: {
  group: NavGroup
  pathname: string
  open: boolean
  onToggle: () => void
}) {
  const hasActiveChild = group.children.some(c => c.href === pathname)
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
          hasActiveChild ? 'text-green' : 'text-dark/80 hover:bg-cream'
        )}
      >
        <span className="text-lg">{group.icon}</span>
        <span className="flex-1 text-right">{group.label}</span>
        <span className={cn('text-[10px] text-muted transition-transform', open ? '' : 'rotate-90')}>
          ▼
        </span>
      </button>
      {open && (
        <div className="mt-1 mr-4 pr-3 border-r-2 border-border/60 space-y-1">
          {group.children.map(child => (
            <LeafLink key={child.href} item={child} active={pathname === child.href} sub />
          ))}
        </div>
      )}
    </div>
  )
}

function LeafLink({ item, active, sub }: { item: NavLeaf; active: boolean; sub?: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-xl font-medium transition-all',
        sub ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-sm',
        active
          ? 'bg-green/10 text-green'
          : 'text-dark/70 hover:bg-cream hover:text-dark'
      )}
    >
      <span className={sub ? 'text-base' : 'text-lg'}>{item.icon}</span>
      {item.label}
    </Link>
  )
}
