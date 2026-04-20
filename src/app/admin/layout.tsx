'use client'

import Sidebar from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'

const adminNav = [
  { href: '/admin', label: 'الإحصائيات', icon: '📊' },
  { href: '/admin/requests', label: 'الطلبات', icon: '📋' },
  { href: '/admin/influencers', label: 'المؤثرون', icon: '👥' },
  { href: '/admin/categories', label: 'الفئات والمزايا', icon: '⚙️' },
  { href: '/admin/users', label: 'المستخدمون', icon: '👤' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 w-full">
      <Sidebar items={adminNav} title="لوحة الإدارة" />
      <div className="flex-1 pb-20 md:pb-0">
        {children}
      </div>
      <BottomNav items={adminNav} />
    </div>
  )
}
