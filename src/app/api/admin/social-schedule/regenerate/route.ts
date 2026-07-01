/**
 * إعادة توليد تصميم منشور في خطة النشر، مع إمكانية تمرير ملاحظة/توجيه.
 * يستخدم نفس بيانات الخبر المخزّنة (العنوان + المحتوى + صورة المصدر) والصياغة نفسها
 * (دائمة + حملة للتغريدات، وتوجيه السيدات الرائدات للمصدر الثاني).
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { runStudioPipeline } from '@/lib/ai-studio'
import { fetchManhomPerson, MANHOM_NOTE } from '@/lib/manhom-news'
import { fetchPostById } from '@/lib/first1-news'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  // ── تحقق الأدمن ──
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { id?: string; note?: string; imageUrl?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  const id = body.id
  const note = (body.note ?? '').toString().trim()
  // صورة مصدر جديدة (اختيارية) — تُستبدل بها الصورة الحالية مع إبقاء نفس المعلومات
  const newImage = (body.imageUrl ?? '').toString().trim()
  if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 })

  const sc = await createServiceRoleClient()
  const { data: row } = await sc
    .from('social_schedule')
    .select('id, source, wp_post_id, post_title, source_content, source_image_url')
    .eq('id', id)
    .single()
  if (!row) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })

  try {
    const isManhom = row.source === 'manhom'

    // المحتوى + صورة المصدر: الصورة الجديدة (إن رُفعت) أولاً، ثم المخزّنة، وإلا نعيد الجلب.
    let title = row.post_title as string
    let content = (row.source_content as string | null) ?? ''
    let sourceImage = newImage || ((row.source_image_url as string | null) ?? '')

    if (!content || !sourceImage) {
      if (isManhom) {
        const person = await fetchManhomPerson(Number(row.wp_post_id))
        if (person) {
          title = title || person.title
          content = content || person.content
          sourceImage = sourceImage || (person.imageUrl ?? '')
        }
      } else {
        const post = await fetchPostById(Number(row.wp_post_id))
        if (post) {
          title = title || post.title
          content = content || post.content
        }
      }
    }

    if (!sourceImage) return NextResponse.json({ error: 'تعذّر تحديد صورة المصدر' }, { status: 422 })

    const studio = await runStudioPipeline({
      title,
      content,
      sourceImages: [sourceImage],
      extraInfo: isManhom ? MANHOM_NOTE : undefined,
      note: note || undefined,
    })

    await sc
      .from('social_schedule')
      .update({
        design_image_url: studio.imageUrl,
        tweets: studio.tweets,
        chosen_concept: studio.chosenConcept,
        // نخزّن المحتوى وصورة المصدر الدائمة (Supabase) للمرات القادمة
        source_content: content,
        source_image_url: studio.sourceImages[0] ?? sourceImage,
      })
      .eq('id', id)

    return NextResponse.json({ success: true, design_image_url: studio.imageUrl, tweets: studio.tweets })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'فشل إعادة التوليد' },
      { status: 500 },
    )
  }
}
