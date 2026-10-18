import { type NavEntry, type NavLeaf } from '@/components/layout/Sidebar'
import AdminAreaShell from '@/components/workforce/AdminAreaShell'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// قائمة شجرية: أقسام رئيسية وتحتها روابط فرعية ذات علاقة.
const adminNav: NavEntry[] = [
  { href: '/admin', label: 'الإحصائيات', icon: '📊' },
  { href: '/admin/workforce', label: 'إدارة الموظفين', icon: '👥' },
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
      { href: '/admin/x-insights', label: 'تحليلات X', icon: '𝕏' },
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin')
  const { data: profile } = await auth.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect(profile?.role === 'employee' ? '/employee' : '/dashboard')
  return (
    <AdminAreaShell items={adminNav} flatItems={adminFlatNav}>{children}</AdminAreaShell>
  )
}
