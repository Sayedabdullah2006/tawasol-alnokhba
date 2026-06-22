/** اعتماد مسودة نشرة وجدولتها للنشر التلقائي. أدمن فقط. body: { id, caption? } */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { id?: string; caption?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()
  const patch: Record<string, unknown> = { status: 'scheduled' }
  if (typeof body.caption === 'string' && body.caption.trim()) patch.caption = body.caption.trim()

  const { error } = await sc.from('newsletters').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
