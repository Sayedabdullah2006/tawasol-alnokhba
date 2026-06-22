/** توليد بوستر النشرة الآن (معاينة) — لا ينشر. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateNewsletterPoster } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  try {
    const out = await generateNewsletterPoster()
    return NextResponse.json({ ok: true, imageUrl: out.imageUrl, direction: out.direction, count: out.items.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل التوليد' }, { status: 500 })
  }
}
