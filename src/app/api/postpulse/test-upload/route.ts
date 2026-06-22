/**
 * اختبار رفع صورة إلى Post-Pulse (presign → PUT → confirm). لا ينشر منشوراً.
 * يستقبل { imageUrl } (رابط تصميم من تخزيننا) ويعيد ناتج التأكيد (مسار الوسائط).
 * أدمن فقط.
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { uploadMediaFromUrl } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { imageUrl?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  if (!imageUrl) return NextResponse.json({ error: 'رابط الصورة مطلوب' }, { status: 400 })

  try {
    const result = await uploadMediaFromUrl(imageUrl)
    return NextResponse.json({ ok: true, media: result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل الرفع' }, { status: 502 })
  }
}
