/**
 * توليد إنفوجرافيك (عدة أشخاص — كل صورة باسمها ونبذتها) — للاستوديو المستقل.
 * أدمن فقط. body: { title, people: [{imageUrl, name, blurb}], extraInfo? }
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateInfographic, INFOGRAPHIC_DIRECTIONS, type InfographicPerson } from '@/lib/ai-studio'
import { getOpenAI, chatComplete, SYS_TWEETS, buildTweetDirectives } from '@/lib/openai'
import { logGeneratedDesign } from '@/lib/newsletter'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'

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

  const title = (body.title ?? '').trim()
  const jobId = await startGenerationJob({ ownerId: user.id, scope: 'standalone', operation: 'infographic' })
  // توليد 3 اتجاهات إبداعية بالتوازي
  const settled = await Promise.allSettled(
    INFOGRAPHIC_DIRECTIONS.map(direction =>
      generateInfographic({ title, people, extraInfo: body.extraInfo, direction }),
    ),
  )
  const images: { imageUrl: string; direction: string }[] = []
  settled.forEach((r, i) => { if (r.status === 'fulfilled') images.push({ imageUrl: r.value.imageUrl, direction: INFOGRAPHIC_DIRECTIONS[i] }) })

  if (!images.length) {
    const err = settled.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
    await failGenerationJob(jobId, err?.reason)
    return NextResponse.json({ error: err?.reason instanceof Error ? err.reason.message : 'فشل التوليد' }, { status: 500 })
  }

  try {
    await throwIfGenerationCancelled(jobId)

  // تسجيل التصاميم في السجلّ الموحّد (مرشّحي النشرة/المجلة)
  for (const im of images) {
    await logGeneratedDesign({
      source: 'standalone',
      title: title || people.map(p => p.name).join('، '),
      content: people.map(p => `${p.name}: ${p.blurb}`).join('\n'),
      category: 'إنفوجرافيك',
      imageUrl: im.imageUrl,
      sourceImageUrl: people[0].imageUrl,
    })
  }

  // توليد 3 تغريدات مقترحة عن الإنفوجرافيك (لا يُفشل الطلب إن تعذّر)
  let tweets = ''
  try {
    const openai = getOpenAI()
    const ctx = `${title}\n${people.map(p => `${p.name}: ${p.blurb}`).join('\n')}`
    const completion = await chatComplete(openai, {
      model: 'gpt-5.5',
      messages: [
        { role: 'system', content: SYS_TWEETS },
        { role: 'user', content: `محتوى إنفوجرافيك جماعي:\n${ctx}\n\n${buildTweetDirectives()}` },
      ],
    })
    tweets = completion.choices[0]?.message?.content ?? ''
  } catch { /* تجاهل */ }

    await completeGenerationJob(jobId, { images, tweets })
    return NextResponse.json({ ok: true, images, tweets })
  } catch (error) {
    await failGenerationJob(jobId, error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'فشل التوليد' }, { status: 500 })
  }
}
