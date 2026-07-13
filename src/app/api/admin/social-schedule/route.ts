/**
 * قراءة خطة النشر الاجتماعي (social_schedule) للعرض في لوحة الإدارة.
 * الجدول محمي بـ RLS، لذا نقرأه عبر service role بعد التحقق من صلاحية الأدمن.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const sc = await createServiceRoleClient()
  const { data, error } = await sc
    .from('social_schedule')
    .select(
      'id, wp_post_id, post_url, post_title, category, source, source_image_url, design_image_url, tweets, batch_date, status, email_sent, created_at',
    )
    .order('batch_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: scheduledRows } = await sc
    .from('postpulse_posts')
    .select('design_url, status')
    .in('status', ['scheduled', 'queued', 'pending'])
    .limit(500)

  const scheduledDesignUrls = new Set(
    (scheduledRows ?? [])
      .map(row => (row.design_url as string | null) || null)
      .filter((url): url is string => !!url),
  )

  const items = (data ?? []).map(item => {
    const isScheduled =
      item.status === 'scheduled' ||
      (!!item.design_image_url && scheduledDesignUrls.has(item.design_image_url))

    return isScheduled && item.status === 'suggested' ? { ...item, status: 'scheduled' } : item
  })

  return NextResponse.json({ items })
}
