/**
 * تضمين/إزالة تصميم مميّز واحد في «مجلة المبدعين».
 * - POST: يضيف تصميماً واحداً مختاراً (من استوديو الطلبات أو المستقل).
 *   لمصدر الطلب: يُشتق الاسم/الفئة/القصة/التغريدات من الطلب نفسه، ويُستبدل
 *   أي تصميم مميّز سابق لنفس الطلب (تصميم واحد مميّز لكل طلب).
 * - DELETE: يزيل تصميماً من المجلة عبر cover أو id.
 * قراءة المجلة عامة؛ هذه العمليات للأدمن فقط (service role).
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { CATEGORIES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const catNameAr = (id: string | null | undefined) =>
  CATEGORIES.find(c => c.id === id)?.nameAr ?? (id ? String(id) : 'منوّعات')

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  return null
}

// يستخرج نص التغريدات من حقل ai_tweets ({raw}) أو من منشور حملة.
function tweetsFrom(v: unknown): string | null {
  if (v && typeof v === 'object' && 'raw' in v) return String((v as Record<string, unknown>).raw ?? '') || null
  return null
}

export async function POST(req: Request) {
  const unauth = await requireAdmin()
  if (unauth) return unauth

  let body: {
    source?: 'request' | 'standalone'
    requestId?: string
    postIndex?: number
    cover?: string
    name?: string
    title?: string
    category?: string
    story?: string
    tweets?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const cover = typeof body.cover === 'string' ? body.cover.trim() : ''
  if (!cover) return NextResponse.json({ error: 'رابط التصميم مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()

  let row: Record<string, unknown>

  if (body.source === 'request') {
    if (!body.requestId) return NextResponse.json({ error: 'معرّف الطلب مطلوب' }, { status: 400 })
    const { data: reqRow } = await sc
      .from('publish_requests')
      .select('id, title, content, category, client_name, ai_tweets, ai_posts, campaign_posts')
      .eq('id', body.requestId)
      .single()
    if (!reqRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    const isPost = typeof body.postIndex === 'number' && body.postIndex >= 0
    const post = isPost && Array.isArray(reqRow.campaign_posts) ? reqRow.campaign_posts[body.postIndex as number] : null
    const name = (reqRow.client_name as string)?.trim() || (reqRow.title as string) || 'مبدع سعودي'
    const title = post?.title ?? (reqRow.title as string) ?? ''
    const story = post?.content ?? (reqRow.content as string) ?? ''
    const category = catNameAr(reqRow.category as string)
    const tweets =
      (isPost ? tweetsFrom(reqRow.ai_posts?.[body.postIndex as number]?.tweets) : null) ??
      tweetsFrom(reqRow.ai_tweets)

    // تصميم واحد مميّز لكل طلب: احذف المميّز السابق لنفس الطلب (ونفس المنشور إن كان حملة)
    let del = sc.from('showcase_designs').delete().eq('request_id', body.requestId)
    del = isPost ? del.eq('post_index', body.postIndex as number) : del.is('post_index', null)
    await del

    row = {
      source: 'request',
      request_id: body.requestId,
      post_index: isPost ? body.postIndex : null,
      name, title, category, story, cover, tweets,
    }
  } else {
    // الاستوديو المستقل: تُمرَّر الحقول من الواجهة
    const name = (body.name ?? body.title ?? '').trim() || 'مبدع سعودي'
    row = {
      source: 'standalone',
      request_id: null,
      post_index: null,
      name,
      title: (body.title ?? '').trim() || name,
      category: (body.category ?? '').trim() || 'منوّعات',
      story: (body.story ?? '').trim(),
      cover,
      tweets: (body.tweets ?? '').trim() || null,
    }
  }

  // upsert على cover (الفريد) — إعادة التضمين تحدّث البيانات بدل التكرار
  const { error } = await sc.from('showcase_designs').upsert(row, { onConflict: 'cover' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const unauth = await requireAdmin()
  if (unauth) return unauth

  let body: { cover?: string; id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const sc = await createServiceRoleClient()
  let q = sc.from('showcase_designs').delete()
  if (body.id) q = q.eq('id', body.id)
  else if (body.cover) q = q.eq('cover', body.cover)
  else return NextResponse.json({ error: 'حدّد cover أو id' }, { status: 400 })

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
