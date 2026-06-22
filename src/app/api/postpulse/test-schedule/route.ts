/**
 * اختبار جدولة منشور لإكمال الـ onboarding — يجدول بتاريخ مستقبلي بعيد افتراضياً
 * (لا يُنشر الآن). أدمن فقط.
 * body: { accountId, content?, attachmentPaths?, scheduledTime? }
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { schedulePost } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: { accountId?: number; content?: string; attachmentPaths?: string[]; scheduledTime?: string; isDraft?: boolean; platformSettings?: Record<string, unknown> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }

  const accountId = Number(body.accountId)
  if (!accountId) return NextResponse.json({ error: 'معرّف الحساب (id) مطلوب' }, { status: 400 })

  // افتراضياً: مسودة (لا تُنشر) + تاريخ بعد سنة — أمان مزدوج لعدم النشر الآن.
  const isDraft = body.isDraft ?? true
  const scheduledTime = body.scheduledTime || new Date(Date.now() + 365 * 86400000).toISOString()
  const content = (body.content ?? '').trim() || 'اختبار جدولة من تواصل النخبة — يُحذف لاحقاً.'

  try {
    const result = await schedulePost({
      socialMediaAccountId: accountId,
      content,
      attachmentPaths: Array.isArray(body.attachmentPaths) ? body.attachmentPaths : undefined,
      scheduledTime,
      isDraft,
      platformSettings: body.platformSettings,
    })
    return NextResponse.json({ ok: true, isDraft, scheduledTime, post: result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'فشل الجدولة' }, { status: 502 })
  }
}
