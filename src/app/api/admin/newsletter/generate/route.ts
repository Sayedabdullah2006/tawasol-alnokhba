/** توليد بوستر النشرة الآن (معاينة) — لا ينشر. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateNewsletterPoster } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// body: { ids?: string[]; scheduledFor?: string } — يولّد مسودة معاينة من التصاميم المختارة.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { ids?: string[]; scheduledFor?: string } = {}
  try { body = await req.json() } catch { /* بلا جسم = توليد تلقائي */ }

  try {
    const out = await generateNewsletterPoster({
      ids: Array.isArray(body.ids) && body.ids.length ? body.ids : undefined,
      endUtc: body.scheduledFor,
      status: 'draft',
    })
    return NextResponse.json({
      ok: true, id: out.id, imageUrl: out.imageUrl, caption: out.caption,
      direction: out.direction, count: out.items.length, label: out.window.label,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل التوليد' }, { status: 500 })
  }
}
