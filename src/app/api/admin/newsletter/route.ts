/** بيانات لوحة نشرة «النخبة في ٧»: نافذة الأسبوع + مرشّحوها + آخر نشرة مولّدة. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getWeeklyWindow, getCandidates } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const window = getWeeklyWindow()
  // كل التصاميم المولّدة (يومية + مستقل + طلبات) الأحدث أولاً
  const candidates = await getCandidates(21)

  const sc = await createServiceRoleClient()
  const { data: latest } = await sc
    .from('newsletters')
    .select('id, label, image_url, direction, caption, published, published_at, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ window, candidates, latest: latest ?? null })
}
