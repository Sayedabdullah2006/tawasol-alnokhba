import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

/**
 * تعديل الأدمن لعنوان/نص الخبر مباشرةً من تفاصيل الطلب.
 * - طلب مفرد: يحدّث title / content.
 * - حملة (postIndex): يحدّث عنوان/محتوى منشور محدّد داخل campaign_posts (دمج).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json()
    const { requestId } = body
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const content = typeof body.content === 'string' ? body.content.trim() : undefined
    const hasPostIndex = typeof body.postIndex === 'number' && Number.isInteger(body.postIndex) && body.postIndex >= 0
    const postIndex: number | null = hasPostIndex ? body.postIndex : null

    if (!requestId) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    if (content !== undefined && content.length === 0) {
      return NextResponse.json({ error: 'نص المحتوى مطلوب' }, { status: 400 })
    }

    const service = await createServiceRoleClient()

    if (postIndex !== null) {
      const { data: reqRow } = await service
        .from('publish_requests')
        .select('campaign_posts')
        .eq('id', requestId)
        .single()
      if (!reqRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
      const posts = Array.isArray(reqRow.campaign_posts) ? [...reqRow.campaign_posts] : []
      if (!posts[postIndex]) return NextResponse.json({ error: 'منشور الحملة غير موجود' }, { status: 404 })
      posts[postIndex] = {
        ...posts[postIndex],
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
      }
      const { error } = await service
        .from('publish_requests')
        .update({ campaign_posts: posts, updated_at: new Date().toISOString() })
        .eq('id', requestId)
      if (error) return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
    } else {
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (title !== undefined) upd.title = title
      if (content !== undefined) upd.content = content
      const { error } = await service.from('publish_requests').update(upd).eq('id', requestId)
      if (error) return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update request content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
