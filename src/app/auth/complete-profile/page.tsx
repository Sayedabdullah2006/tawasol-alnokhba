import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { customerProfileComplete } from '@/lib/customer-profile'
import { portalLoginDestination, safePortalReturnPath } from '@/lib/portal-login'
import CompleteProfileForm from './profile-form'

export const metadata = { title: 'إكمال الملف الشخصي | تواصل النخبة' }

export default async function CompleteProfilePage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next: requested } = await searchParams
  const next = safePortalReturnPath(typeof requested === 'string' ? requested : null)
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error && (error.status ?? 0) >= 500) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-dark">
        <h1 className="text-xl font-bold">تعذّر التحقق من جلستك مؤقتًا</h1>
        <p className="mt-2">حدّث الصفحة للمحاولة مرة أخرى.</p>
      </div>
    )
  }
  if (!user) redirect(next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login')

  const { data: profile } = await supabase.from('profiles')
    .select('full_name, phone, role').eq('id', user.id).maybeSingle()
  if (profile && customerProfileComplete(profile)) redirect(portalLoginDestination(profile.role, next))

  const googleName = typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : ''
  return (
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 md:p-8">
        <h1 className="mb-2 text-2xl font-black text-dark">أكمل ملفك الشخصي</h1>
        <p className="mb-6 text-sm text-muted">نستخدم اسمك ورقم جوالك للتواصل معك بشأن طلبك.</p>
        <CompleteProfileForm name={profile?.full_name?.trim() || googleName} phone={profile?.phone ?? ''} email={user.email ?? ''} next={next} />
      </div>
    </div>
  )
}
