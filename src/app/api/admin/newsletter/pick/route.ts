/** تثبيت/إلغاء ترشيح عنصر للنشرة + ترتيب اختياري. أدمن فقط. body: { id, include, rank? } */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { id?: string; include?: boolean; rank?: number | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()
  const { error } = await sc
    .from('social_schedule')
    .update({
      in_newsletter: !!body.include,
      newsletter_rank: typeof body.rank === 'number' ? body.rank : null,
    })
    .eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
