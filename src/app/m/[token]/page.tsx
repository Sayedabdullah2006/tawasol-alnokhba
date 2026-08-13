import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PublicMemberMagazine from '@/components/memberships/PublicMemberMagazine'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { loadMemberMagazineItems } from '@/lib/member-magazine'

export const dynamic = 'force-dynamic'

async function loadMagazine(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null
  const service = await createServiceRoleClient()
  const { data } = await service
    .from('membership_magazines')
    .select('membership_id, display_name, bio, is_public, memberships(plan_id, membership_plans(name_ar))')
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const magazine = await loadMagazine(token)
  const name = magazine?.display_name ?? 'مجلة العضو'
  return {
    title: `مجلة ${name} | تواصل النخبة`,
    description: magazine?.bio ?? `التصاميم المعتمدة لـ ${name}`,
    robots: { index: false, follow: false },
  }
}

export default async function PublicMagazinePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const magazine = await loadMagazine(token)
  if (!magazine) notFound()
  const membership = magazine.memberships as unknown as { plan_id?: string; membership_plans?: { name_ar?: string } | null } | null
  const items = await loadMemberMagazineItems(magazine.membership_id)
  return <PublicMemberMagazine displayName={magazine.display_name} bio={magazine.bio ?? ''} planName={membership?.membership_plans?.name_ar ?? 'عضوية تواصل النخبة'} items={items} />
}
