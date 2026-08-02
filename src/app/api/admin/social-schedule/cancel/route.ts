import { NextResponse } from 'next/server'
import { cancelScheduledPost } from '@/lib/postpulse'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'معرّف المنشور مطلوب' }, { status: 400 })

  try {
    const service = await createServiceRoleClient()
    const { data: item, error: itemError } = await service
      .from('social_schedule')
      .select('id,status,design_image_url,tweets')
      .eq('id', body.id)
      .single()
    if (itemError || !item) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
    if (item.status !== 'scheduled') return NextResponse.json({ error: 'هذا المنشور ليس مجدولاً حالياً' }, { status: 400 })

    const { data: schedules, error: scheduleError } = await service
      .from('postpulse_posts')
      .select('id,schedule_id,design_url,content')
      .eq('status', 'scheduled')
      .eq('design_url', item.design_image_url ?? '')
      .order('created_at', { ascending: false })
      .limit(5)
    if (scheduleError) throw scheduleError
    const schedule = (schedules ?? []).find(row => row.content === item.tweets) ?? schedules?.[0]
    if (!schedule?.schedule_id) {
      return NextResponse.json({ error: 'تعذّر العثور على معرّف الجدولة في PostPulse؛ لم يتم تغيير حالة المنشور.' }, { status: 409 })
    }

    await cancelScheduledPost(String(schedule.schedule_id))
    await service.from('postpulse_posts').update({ status: 'cancelled' }).eq('id', schedule.id)
    await service.from('social_schedule').update({ status: 'suggested' }).eq('id', item.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر إلغاء الجدولة' }, { status: 502 })
  }
}
