/** بيانات لوحة نشرة «النخبة في ٧»: نافذة الأسبوع + مرشّحوها + آخر نشرة مولّدة. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getCandidates, upcomingFridays } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const sc = await createServiceRoleClient()

  // سجلّ النشرات (الأحدث أولاً)
  const { data: history } = await sc
    .from('newsletters')
    .select('id, label, image_url, direction, caption, status, scheduled_for, published, published_at, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  // الجمعات القادمة + حالة كل واحدة (هل لها نشرة مجهّزة؟)
  const fridays = upcomingFridays(3)
  const rows = history ?? []
  const upcoming = fridays.map(f => {
    const match = rows.find(r => r.scheduled_for && Math.abs(new Date(r.scheduled_for).getTime() - new Date(f.endUtc).getTime()) < 3600 * 1000)
    return { endUtc: f.endUtc, label: f.label, newsletter: match ?? null }
  })

  // كل التصاميم المولّدة (يومية + مستقل + طلبات) الأحدث أولاً — للبوب-أب
  const candidates = await getCandidates(21)

  return NextResponse.json({ upcoming, history: rows, candidates })
}
