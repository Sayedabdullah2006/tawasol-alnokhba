import Sidebar, { type NavEntry, type NavLeaf } from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'
import GenerationJobMonitor from '@/components/admin/GenerationJobMonitor'

export const dynamic = 'force-dynamic'

// قائمة شجرية: أقسام رئيسية وتحتها روابط فرعية ذات علاقة.
const adminNav: NavEntry[] = [
  { href: '/admin', label: 'الإحصائيات', icon: '📊' },
  {
    label: 'الطلبات والعملاء',
    icon: '📋',
    children: [
      { href: '/admin/requests', label: 'الطلبات', icon: '🧾' },
      { href: '/admin/inventor-store-requests', label: 'طلبات مسار المخترع', icon: '◉' },
      { href: '/admin/member-requests', label: 'طلبات الأعضاء', icon: '◈' },
      { href: '/admin/memberships', label: 'الأعضاء', icon: '★' },
      { href: '/admin/influencers', label: 'المؤثرون', icon: '👥' },
      { href: '/admin/users', label: 'المستخدمون', icon: '👤' },
    ],
  },
  {
    label: 'المحتوى والنشر',
    icon: '📣',
    children: [
      { href: '/admin/studio', label: 'استوديو الذكاء (مستقل)', icon: '🤖' },
      { href: '/admin/social', label: 'خطة النشر اليومية', icon: '🗓️' },
      { href: '/admin/social/inso-2026', label: 'تغطية INSO 2026', icon: '⚛️' },
      { href: '/admin/newsletter', label: 'النخبة في ٧', icon: '🗞️' },
      { href: '/admin/social/calendar', label: 'تقويم الجدولة', icon: '📆' },
      { href: '/admin/x-radar', label: 'رادار X', icon: '📡' },
      { href: '/admin/integrations', label: 'النشر للقنوات', icon: '🔗' },
      { href: '/showcase', label: 'مجلة المبدعين', icon: '🎬' },
    ],
  },
  {
    label: 'المبيعات والتسعير',
    icon: '🛒',
    children: [
      { href: '/admin/categories', label: 'الفئات والمزايا', icon: '⚙️' },
      { href: '/admin/discounts', label: 'أكواد الخصم', icon: '🏷️' },
    ],
  },
  {
    label: 'الإعدادات والهوية',
    icon: '🎨',
    children: [
      { href: '/admin/brand', label: 'شعار التصاميم', icon: '🖼️' },
      { href: '/admin/site-content', label: 'محتوى النموذج', icon: '📄' },
    ],
  },
]

// نسخة مسطّحة (روابط فقط) لشريط التنقّل السفلي في الجوال.
const adminFlatNav: NavLeaf[] = adminNav.flatMap(e => ('children' in e ? e.children : [e]))

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell flex w-full min-w-0 flex-1 overflow-x-clip">
      <Sidebar items={adminNav} title="لوحة الإدارة" />
      <div className="admin-content w-full min-w-0 flex-1 overflow-x-clip pb-20 md:pb-0">
        {children}
      </div>
      <BottomNav items={adminFlatNav} />
      <GenerationJobMonitor />
    </div>
  )
}
