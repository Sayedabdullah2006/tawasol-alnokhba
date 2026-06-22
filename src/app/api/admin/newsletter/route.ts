/** بيانات لوحة نشرة «النخبة في ٧»: نافذة الأسبوع + مرشّحوها + آخر نشرة مولّدة. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getWeeklyWindow } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const window = getWeeklyWindow()
  const sc = await createServiceRoleClient()

  const { data: candidates } = await sc
    .from('social_schedule')
    .select('id, post_title, category, design_image_url, in_newsletter, newsletter_rank, created_at')
    .not('design_image_url', 'is', null)
    .gte('created_at', window.startUtc)
    .lte('created_at', window.endUtc)
    .order('in_newsletter', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(80)

  const { data: latest } = await sc
    .from('newsletters')
    .select('id, label, image_url, direction, published, published_at, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ window, candidates: candidates ?? [], latest: latest ?? null })
}
