/**
 * توليد إنفوجرافيك (عدة أشخاص — كل صورة باسمها ونبذتها) — للاستوديو المستقل.
 * أدمن فقط. body: { title, people: [{imageUrl, name, blurb}], extraInfo? }
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateInfographic, type InfographicPerson } from '@/lib/ai-studio'
import { logGeneratedDesign } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { title?: string; people?: InfographicPerson[]; extraInfo?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const people = (Array.isArray(body.people) ? body.people : [])
    .map(p => ({ imageUrl: String(p?.imageUrl ?? '').trim(), name: String(p?.name ?? '').trim(), blurb: String(p?.blurb ?? '').trim() }))
    .filter(p => p.imageUrl && p.name)
  if (!people.length) return NextResponse.json({ error: 'أضِف صورة شخص واحدة على الأقل مع اسمه' }, { status: 400 })

  try {
    const { imageUrl } = await generateInfographic({ title: body.title ?? '', people, extraInfo: body.extraInfo })
    // تسجيل في السجلّ الموحّد (مرشّحي النشرة/المجلة)
    await logGeneratedDesign({
      source: 'standalone',
      title: (body.title ?? '').trim() || people.map(p => p.name).join('، '),
      content: people.map(p => `${p.name}: ${p.blurb}`).join('\n'),
      category: 'إنفوجرافيك',
      imageUrl,
      sourceImageUrl: people[0].imageUrl,
    })
    return NextResponse.json({ ok: true, imageUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل التوليد' }, { status: 500 })
  }
}
