import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyPostCompletedToClient } from '@/lib/email'

/**
 * تحديث حالة نشر منشور واحد في حملة (قيد التنفيذ / مكتمل).
 * عند التحويل إلى «مكتمل» يُرسل للعميل إيميل بصياغة مناسبة.
 * حالة الطلب ككل تبقى كما هي (يُكملها الأدمن يدوياً).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json()
    const { requestId, status } = body
    const postIndex = Number(body.postIndex)

    if (!requestId || !Number.isInteger(postIndex) || postIndex < 0) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }
    if (status !== 'in_progress' && status !== 'completed') {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
    }

    const service = await createServiceRoleClient()
    const { data: reqRow } = await service
      .from('publish_requests')
      .select('request_number, client_name, client_email, campaign_posts, post_statuses')
      .eq('id', requestId)
      .single()

    if (!reqRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    const posts = Array.isArray(reqRow.campaign_posts) ? reqRow.campaign_posts : []
    if (!posts[postIndex]) {
      return NextResponse.json({ error: 'منشور الحملة غير موجود' }, { status: 404 })
    }

    const statuses: Record<string, string> =
      reqRow.post_statuses && typeof reqRow.post_statuses === 'object' ? { ...reqRow.post_statuses } : {}
    const prev = statuses[postIndex] ?? 'in_progress'
    statuses[postIndex] = status

    const { error } = await service
      .from('publish_requests')
      .update({ post_statuses: statuses, updated_at: new Date().toISOString() })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الحالة' }, { status: 500 })
    }

    // إيميل عند التحويل إلى «مكتمل» (وفقط إذا تغيّرت الحالة فعلاً)
    if (status === 'completed' && prev !== 'completed' && reqRow.client_email) {
      const requestNumber = `ATH-${String(reqRow.request_number).padStart(4, '0')}`
      notifyPostCompletedToClient({
        email: reqRow.client_email,
        requestNumber,
        clientName: reqRow.client_name ?? 'عزيزنا العميل',
        postTitle: (posts[postIndex]?.title as string) || `منشور ${postIndex + 1}`,
        postIndex,
      }).catch(e => console.error('Post completed email failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update post status error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
