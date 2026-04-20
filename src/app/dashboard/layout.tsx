import Sidebar from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'

export const dynamic = 'force-dynamic'

const dashboardNav = [
  { href: '/dashboard', label: 'طلباتي', icon: '📋' },
  { href: '/request', label: 'طلب جديد', icon: '➕' },
  { href: '/dashboard/profile', label: 'الملف الشخصي', icon: '👤' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 w-full">
      <Sidebar items={dashboardNav} title="لوحة التحكم" />
      <div className="flex-1 pb-20 md:pb-0">
        {children}
      </div>
      <BottomNav items={dashboardNav} />
    </div>
  )
}
