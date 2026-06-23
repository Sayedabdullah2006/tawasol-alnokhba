/** قائمة المنشورات المجدولة/المنشورة (لتقويم الجدولة). أدمن فقط.
 * المصدر: Post-Pulse مباشرةً (مصدر الحقيقة) مدموجاً مع سجلّنا (لإظهار المصغّرات). */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { listScheduledPosts } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'

interface CalItem {
  id: string
  content: string | null
  designUrl: string | null
  channels: number
  status: string
  when: string
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const sc = await createServiceRoleClient()
  const { data: dbRows } = await sc
    .from('postpulse_posts')
    .select('schedule_id, content, design_url, accounts, status, scheduled_for, created_at')
    .limit(500)

  // سجلّنا مفهرس بمعرّف الجدولة (لإضافة المصغّرات للعناصر القادمة من Post-Pulse)
  const byScheduleId = new Map<string, { designUrl: string | null; content: string | null }>()
  const dbItems: CalItem[] = []
  for (const r of dbRows ?? []) {
    const when = (r.scheduled_for ?? r.created_at) as string | null
    if (r.schedule_id) byScheduleId.set(String(r.schedule_id), { designUrl: r.design_url, content: r.content })
    if (when) {
      dbItems.push({
        id: String(r.schedule_id ?? when),
        content: r.content,
        designUrl: r.design_url,
        channels: Array.isArray(r.accounts) ? r.accounts.length : 0,
        status: r.status,
        when,
      })
    }
  }

  // المصدر الأساسي: Post-Pulse (يشمل ما لم نسجّله)
  let ppItems: CalItem[] = []
  try {
    const pp = await listScheduledPosts()
    ppItems = pp.map(p => {
      const extra = byScheduleId.get(p.id)
      return {
        id: p.id,
        content: p.content || extra?.content || null,
        designUrl: extra?.designUrl ?? null,
        channels: p.channels,
        status: p.status,
        when: p.when,
      }
    })
  } catch { /* fallback لسجلّنا فقط */ }

  // الدمج: نبدأ بعناصر Post-Pulse، ونضيف سجلّاتنا غير الموجودة فيها (دمج بالمعرّف)
  const seen = new Set(ppItems.map(i => i.id))
  const merged = [...ppItems]
  for (const it of dbItems) if (!seen.has(it.id)) merged.push(it)

  return NextResponse.json({ items: merged })
}
