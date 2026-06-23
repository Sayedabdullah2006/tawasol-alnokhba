/** قائمة المنشورات المجدولة/المنشورة (لتقويم الجدولة). أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const sc = await createServiceRoleClient()
  const { data } = await sc
    .from('postpulse_posts')
    .select('id, content, design_url, accounts, status, scheduled_for, created_at')
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .limit(500)

  const items = (data ?? []).map(r => ({
    id: r.id,
    content: r.content,
    designUrl: r.design_url,
    channels: Array.isArray(r.accounts) ? r.accounts.length : 0,
    status: r.status,
    when: r.scheduled_for ?? r.created_at, // ISO UTC
  })).filter(i => i.when)

  return NextResponse.json({ items })
}
