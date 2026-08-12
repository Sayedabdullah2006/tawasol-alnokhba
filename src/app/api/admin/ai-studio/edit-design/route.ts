/**
 * تعديل دقيق لتصميم جاهز (نفس التصميم/الصورة مع تطبيق التعديل المطلوب فقط).
 * أدمن فقط. body: { imageUrl, note, referenceImageUrls? }
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { editDesign } from '@/lib/ai-studio'
import { completeGenerationJob, failGenerationJob, startGenerationJob, throwIfGenerationCancelled } from '@/lib/generation-jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { imageUrl?: string; note?: string; referenceImageUrls?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  const imageUrl = (body.imageUrl ?? '').trim()
  const note = (body.note ?? '').trim()
  const referenceImageUrls = Array.isArray(body.referenceImageUrls)
    ? body.referenceImageUrls.filter((url): url is string => typeof url === 'string' && /^https:\/\//.test(url)).slice(0, 5)
    : []
  if (!imageUrl) return NextResponse.json({ error: 'لا يوجد تصميم للتعديل' }, { status: 400 })
  if (!note) return NextResponse.json({ error: 'اكتب التعديل المطلوب' }, { status: 400 })
  const jobId = await startGenerationJob({ ownerId: user.id, scope: 'standalone', operation: 'edit' })

  try {
    const { imageUrl: out } = await editDesign({ designImageUrl: imageUrl, note, referenceImageUrls })
    await throwIfGenerationCancelled(jobId)
    await completeGenerationJob(jobId, { imageUrl: out })
    return NextResponse.json({ ok: true, imageUrl: out })
  } catch (e) {
    await failGenerationJob(jobId, e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل التعديل' }, { status: 500 })
  }
}
