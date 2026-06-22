/**
 * النشر الفعلي عبر Post-Pulse: يرفع التصميم ثم ينشر النص + التصميم إلى الحسابات
 * المربوطة (كلها افتراضياً). أدمن فقط.
 * body: { content, imageUrl, accountIds?, requestId?, postIndex? }
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

  let body: { content?: string; imageUrl?: string; accountIds?: number[]; requestId?: string; postIndex?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const content = (body.content ?? '').trim()
  const imageUrl = (body.imageUrl ?? '').trim()
  if (!content && !imageUrl) {
    return NextResponse.json({ error: 'النص أو التصميم مطلوب' }, { status: 400 })
  }

  try {
    // 1) رفع التصميم (إن وُجد) للحصول على مسار الوسائط
    const attachmentPaths: string[] = []
    if (imageUrl) {
      const media = await uploadMediaFromUrl(imageUrl)
      if (media.path) attachmentPaths.push(media.path)
    }

    // 2) النشر الفوري لكل الحسابات (أو المحددة)
    const { result, accountIds, scheduleId } = await publishNow({
      content: content || ' ',
      attachmentPaths,
      accountIds: Array.isArray(body.accountIds) && body.accountIds.length ? body.accountIds : undefined,
    })

    // 3) تسجيل المنشور لتتبّع حالته عبر الـ webhook
    try {
      const sc = await createServiceRoleClient()
      await sc.from('postpulse_posts').insert({
        schedule_id: scheduleId,
        request_id: body.requestId ?? null,
        post_index: typeof body.postIndex === 'number' ? body.postIndex : null,
        content,
        design_url: imageUrl || null,
        accounts: accountIds,
        status: 'published',
        event_raw: result as object,
      })
    } catch { /* تجاهل أخطاء التسجيل */ }

    return NextResponse.json({ ok: true, accountIds, result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل النشر' }, { status: 502 })
  }
}
