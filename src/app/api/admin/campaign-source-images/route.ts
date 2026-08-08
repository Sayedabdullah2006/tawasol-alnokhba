import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/** يعيد اختيار صور المصدر المحفوظ حالاً لخبر حملة، حتى لا يحتاج الأدمن لتحديث الصفحة. */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    const { requestId, postIndex } = await request.json()
    if (typeof requestId !== 'string' || !Number.isInteger(postIndex) || postIndex < 0) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    const { data: row } = await supabase.from('publish_requests').select('campaign_posts,ai_posts').eq('id', requestId).single()
    const post = Array.isArray(row?.campaign_posts) ? row.campaign_posts[postIndex] : null
    const studio = row?.ai_posts?.[postIndex] ?? {}
    const preferred = Array.isArray(studio?.selected_images) && studio.selected_images.length
      ? studio.selected_images
      : (studio?.source_image ? [studio.source_image] : post?.images)
    const sourceImages = Array.isArray(preferred) ? preferred.filter((url: unknown): url is string => typeof url === 'string' && url.length > 0) : []
    return NextResponse.json({ sourceImages })
  } catch {
    return NextResponse.json({ error: 'تعذر قراءة صور المصدر' }, { status: 500 })
  }
}
