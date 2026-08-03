import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { listScheduledPosts, publishNow, uploadMediaFromUrl } from '@/lib/postpulse'
import { FIRST1_OCCASION_SOURCE } from '@/lib/first1-occasions'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const HOURS = [9, 11, 13, 16, 18, 19, 20, 21, 22]
const isActive = (status: unknown) => !['failed', 'cancelled', 'canceled', 'draft', 'media_import_failed'].includes(String(status ?? '').toLowerCase())

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 403 }) }
  return { user }
}

function candidateFor(day: string, occupied: number[]): Date | null {
  for (const hour of HOURS) {
    const candidate = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`)
    if (candidate.getTime() <= Date.now() + 60_000) continue
    if (occupied.every(time => Math.abs(time - candidate.getTime()) >= 90 * 60_000)) return candidate
  }
  return null
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  let body: { id?: string; content?: string; date?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'معرف المنشور مطلوب' }, { status: 400 })
  const service = await createServiceRoleClient()
  const { data: item, error } = await service.from('social_schedule')
    .select('id,source,post_title,tweets,design_image_url,batch_date,status')
    .eq('id', body.id).single()
  if (error || !item || item.source !== FIRST1_OCCASION_SOURCE) return NextResponse.json({ error: 'منشور المناسبة غير موجود' }, { status: 404 })
  if (item.status === 'scheduled') return NextResponse.json({ error: 'هذه المناسبة مجدولة بالفعل' }, { status: 409 })
  const content = (body.content ?? item.tweets ?? '').trim()
  if (!item.design_image_url || !content) return NextResponse.json({ error: 'يلزم وجود النص والتصميم قبل الجدولة' }, { status: 422 })
  const chosenDate = (body.date ?? '').trim()
  const isUndatedOccasion = String(item.batch_date) === '2099-12-31'
  if (isUndatedOccasion && !/^\d{4}-\d{2}-\d{2}$/.test(chosenDate)) {
    return NextResponse.json({ error: 'اختر تاريخ العيد قبل الجدولة' }, { status: 422 })
  }
  const targetDate = isUndatedOccasion ? chosenDate : String(item.batch_date)
  const { data: local } = await service.from('postpulse_posts').select('scheduled_for,status')
    .gte('scheduled_for', `${targetDate}T00:00:00+03:00`).lte('scheduled_for', `${targetDate}T23:59:59+03:00`)
  const occupied = (local ?? []).filter(row => isActive(row.status) && row.scheduled_for).map(row => new Date(String(row.scheduled_for)).getTime())
  try {
    const remote = await listScheduledPosts()
    occupied.push(...remote.filter(row => isActive(row.status)).map(row => new Date(row.when).getTime()))
  } catch { /* سجلنا المحلي يبقى مرجعاً احتياطياً. */ }
  const scheduledFor = candidateFor(targetDate, occupied)
  if (!scheduledFor) return NextResponse.json({ error: 'لا يوجد وقت مناسب شاغر في تاريخ المناسبة' }, { status: 409 })
  try {
    const media = await uploadMediaFromUrl(String(item.design_image_url))
    const published = await publishNow({ content, attachmentPaths: media.path ? [media.path] : [], scheduledTime: scheduledFor.toISOString() })
    await service.from('postpulse_posts').insert({ schedule_id: published.scheduleId, content, design_url: item.design_image_url, accounts: published.accountIds, status: 'scheduled', scheduled_for: scheduledFor.toISOString(), event_raw: published.result as object })
    await service.from('social_schedule').update({ status: 'scheduled', tweets: content, batch_date: targetDate }).eq('id', item.id)
    return NextResponse.json({ ok: true, scheduledFor: scheduledFor.toISOString(), accountIds: published.accountIds })
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'تعذرت الجدولة' }, { status: 502 })
  }
}
