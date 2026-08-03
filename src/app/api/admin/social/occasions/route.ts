import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'
import { FIRST1_OCCASION_SOURCE, generateFirst1Occasion, getFirst1Occasions, occasionKey } from '@/lib/first1-occasions'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('social_schedule')
    .select('id,post_url,post_title,category,source,source_content,design_image_url,tweets,batch_date,status,created_at')
    .eq('source', FIRST1_OCCASION_SOURCE)
    .order('batch_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ occasions: getFirst1Occasions(), items: data ?? [] })
}

async function saveOccasion(occasionId: string) {
  const occasion = getFirst1Occasions().find(item => occasionKey(item) === occasionId)
  if (!occasion) throw new Error('المناسبة غير موجودة')
  const service = await createServiceRoleClient()
  const key = `occasion:${occasionId}`
  const { data: existing, error: existingError } = await service.from('social_schedule')
    .select('id').eq('source', FIRST1_OCCASION_SOURCE).eq('post_url', key).maybeSingle()
  if (existingError) throw existingError
  const generated = await generateFirst1Occasion(occasion)
  const payload = {
    post_url: key,
    post_title: generated.content.title,
    category: occasion.category,
    source: FIRST1_OCCASION_SOURCE,
    source_content: JSON.stringify({ occasionId, dateLabel: occasion.dateLabel, kind: occasion.kind, facts: occasion.facts }),
    source_image_url: null,
    design_image_url: generated.designUrl,
    tweets: generated.content.caption,
    chosen_concept: generated.content.visualDirection,
    batch_date: occasion.date ?? '2099-12-31',
    status: 'suggested',
    email_sent: false,
  }
  if (existing?.id) {
    const { error } = await service.from('social_schedule').update(payload).eq('id', existing.id)
    if (error) throw error
    return { id: existing.id, title: generated.content.title }
  }
  const wpPostId = -Number(`7${String(Date.now()).slice(-11)}`)
  const { data, error } = await service.from('social_schedule').insert({ ...payload, wp_post_id: wpPostId }).select('id').single()
  if (error) throw error
  try {
    await service.from('generated_designs').insert({
      source: 'daily', title: generated.content.title, content: generated.content.caption,
      category: 'مناسبات أول سعودي', image_url: generated.designUrl, source_image_url: null,
    })
  } catch { /* لا نعطل حفظ المناسبة إذا تعذر سجل المجلة. */ }
  return { id: data.id, title: generated.content.title }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  let body: { action?: 'generate-all' | 'regenerate'; occasionId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (body.action !== 'generate-all' && body.action !== 'regenerate') return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })
  const requested = body.action === 'regenerate' ? [String(body.occasionId ?? '')] : getFirst1Occasions().map(occasionKey)
  if (!requested.every(Boolean)) return NextResponse.json({ error: 'حدد المناسبة المطلوبة' }, { status: 400 })
  const jobId = await startGenerationJob({ ownerId: auth.user.id, scope: 'social', operation: 'occasion-design' })
  try {
    const done: { id: string; title: string }[] = []
    const failed: { id: string; error: string }[] = []
    for (let index = 0; index < requested.length; index += 3) {
      await throwIfGenerationCancelled(jobId)
      const results = await Promise.allSettled(requested.slice(index, index + 3).map(async occasionId => ({ occasionId, ...(await saveOccasion(occasionId)) })))
      results.forEach((result, offset) => {
        if (result.status === 'fulfilled') done.push({ id: result.value.occasionId, title: result.value.title })
        else failed.push({
          id: requested[index + offset],
          error: result.reason instanceof Error ? result.reason.message : 'تعذر توليد المناسبة',
        })
      })
    }
    if (body.action === 'regenerate' && !done.length) {
      throw new Error(failed[0]?.error ?? 'تعذر توليد المناسبة')
    }
    await completeGenerationJob(jobId, { generated: done.length, failed: failed.length })
    return NextResponse.json({ ok: true, generated: done, failed })
  } catch (error) {
    await failGenerationJob(jobId, error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر توليد المناسبات' }, { status: 500 })
  }
}
