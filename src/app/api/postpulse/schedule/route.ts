/**
 * جدولة منشور في موعد محدّد (بتوقيت السعودية) لكل القنوات عبر Post-Pulse.
 * أدمن فقط. body: { content, imageUrl?, scheduledLocal: "YYYY-MM-DDTHH:mm", accountIds? }
 * scheduledLocal يُفسَّر كتوقيت السعودية (UTC+3).
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

  let body: { content?: string; imageUrl?: string; scheduledLocal?: string; accountIds?: number[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const content = (body.content ?? '').trim()
  const imageUrl = (body.imageUrl ?? '').trim()
  const local = (body.scheduledLocal ?? '').trim()
  if (!content && !imageUrl) return NextResponse.json({ error: 'النص أو التصميم مطلوب' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    return NextResponse.json({ error: 'حدّد تاريخ ووقت الجدولة' }, { status: 400 })
  }

  // تفسير الوقت كتوقيت السعودية (UTC+3) → ISO بتوقيت UTC
  const scheduledTime = new Date(`${local}:00+03:00`)
  if (isNaN(scheduledTime.getTime())) return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 })
  if (scheduledTime.getTime() < Date.now() + 60 * 1000) {
    return NextResponse.json({ error: 'اختر وقتاً مستقبلياً (بعد الآن بدقيقة على الأقل)' }, { status: 400 })
  }

  try {
    const attachmentPaths: string[] = []
    if (imageUrl) {
      const media = await uploadMediaFromUrl(imageUrl)
      if (media.path) attachmentPaths.push(media.path)
    }
    const { accountIds, scheduleId, result } = await publishNow({
      content: content || ' ',
      attachmentPaths,
      accountIds: Array.isArray(body.accountIds) && body.accountIds.length ? body.accountIds : undefined,
      scheduledTime: scheduledTime.toISOString(),
    })

    // تسجيل المنشور المجدول للتتبّع
    try {
      const sc = await createServiceRoleClient()
      await sc.from('postpulse_posts').insert({
        schedule_id: scheduleId,
        content,
        design_url: imageUrl || null,
        accounts: accountIds,
        status: 'scheduled',
        event_raw: result as object,
      })
    } catch { /* تجاهل */ }

    return NextResponse.json({ ok: true, accountIds, scheduledTime: scheduledTime.toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل الجدولة' }, { status: 502 })
  }
}
