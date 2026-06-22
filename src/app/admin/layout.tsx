import Sidebar from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'

export const dynamic = 'force-dynamic'

const adminNav = [
  { href: '/admin', label: 'الإحصائيات', icon: '📊' },
  { href: '/admin/requests', label: 'الطلبات', icon: '📋' },
  { href: '/admin/social', label: 'خطة النشر', icon: '🗓️' },
  { href: '/admin/newsletter', label: 'النخبة في ٧', icon: '🗞️' },
  { href: '/admin/discounts', label: 'أكواد الخصم', icon: '🏷️' },
  { href: '/admin/influencers', label: 'المؤثرون', icon: '👥' },
  { href: '/admin/categories', label: 'الفئات والمزايا', icon: '⚙️' },
  { href: '/admin/users', label: 'المستخدمون', icon: '👤' },
  { href: '/admin/brand', label: 'شعار التصاميم', icon: '🎨' },
  { href: '/admin/site-content', label: 'محتوى النموذج', icon: '📄' },
  { href: '/admin/integrations', label: 'النشر للقنوات', icon: '🔗' },
  { href: '/showcase', label: 'مجلة المبدعين', icon: '🎬' },
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
