/**
 * اعتماد نشرة وجدولتها مباشرةً في Post-Pulse على X فقط في موعد الجمعة،
 * فتظهر في التقويم وتُنشر تلقائياً. أدمن فقط. body: { id, caption? }
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { uploadMediaFromUrl, publishNow } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

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
  const { data: nl } = await sc
    .from('newsletters')
    .select('id, image_url, caption, label, scheduled_for')
    .eq('id', body.id)
    .single()
  if (!nl) return NextResponse.json({ error: 'النشرة غير موجودة' }, { status: 404 })

  const caption = (body.caption && body.caption.trim()) || nl.caption || `النخبة في ٧ — ${nl.label}`
  // موعد الجمعة (إن كان ماضياً أو قريباً جداً نؤجّله دقيقتين)
  let when = nl.scheduled_for ? new Date(nl.scheduled_for) : new Date(Date.now() + 5 * 60 * 1000)
  if (when.getTime() < Date.now() + 60 * 1000) when = new Date(Date.now() + 5 * 60 * 1000)

  try {
    // رفع البوستر ثم الجدولة على X فقط في الموعد
    const media = await uploadMediaFromUrl(nl.image_url)
    const { accountIds, scheduleId, result } = await publishNow({
      content: caption,
      attachmentPaths: media.path ? [media.path] : undefined,
      platforms: ['X_TWITTER'],
      scheduledTime: when.toISOString(),
    })

    await sc.from('newsletters').update({ status: 'scheduled', caption }).eq('id', nl.id)
    try {
      await sc.from('postpulse_posts').insert({
        schedule_id: scheduleId,
        content: caption,
        design_url: nl.image_url,
        accounts: accountIds,
        status: 'scheduled',
        scheduled_for: when.toISOString(),
        event_raw: result as object,
      })
    } catch { /* تجاهل */ }

    return NextResponse.json({ ok: true, scheduledFor: when.toISOString(), channels: accountIds.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل الجدولة' }, { status: 502 })
  }
}
