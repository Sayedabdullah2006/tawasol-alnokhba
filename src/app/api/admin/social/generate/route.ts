/**
 * توليد يدوي لمنشورات إضافية لنفس اليوم (زر في صفحة خطة النشر). أدمن فقط.
 * يعيد استخدام منطق المُنسّق اليومي مع force=true (يتخطّى حماية «تم توليد اليوم»)
 * فيضيف منشورات جديدة بلا تكرار المصدر خلال نافذة الأيام.
 * body: { count?: 1..3 }
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { runBatch } from '@/app/api/cron/daily-social/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let count = 1
  try {
    const body = await req.json()
    count = Math.max(1, Math.min(3, Number(body?.count) || 1))
  } catch { /* الافتراضي 1 */ }

  return runBatch({ count, force: true, sourceParam: null })
}
