import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { listScheduledPosts } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'

const KSA_MS = 3 * 60 * 60 * 1000
const GOOD_HOURS = [10, 13, 18, 20]
const MAX_PER_DAY = 3
const DAY_MS = 24 * 60 * 60 * 1000
const p2 = (value: number) => String(value).padStart(2, '0')

function localParts(ms: number) {
  const date = new Date(ms + KSA_MS)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
}

function localDateTime(parts: { year: number; month: number; day: number }, hour: number) {
  return `${parts.year}-${p2(parts.month + 1)}-${p2(parts.day)}T${p2(hour)}:00`
}

function labelFor(value: string) {
  return new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(`${value}:00+03:00`))
}

/** مواعيد مقترحة للحملة: أقرب وقت مناسب، ثم فاصل يومين على الأقل بين أخبارها. */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    const { count } = await request.json()
    const wanted = Math.max(1, Math.min(Number(count) || 1, 12))

    const service = await createServiceRoleClient()
    const active = (status: unknown) => !['failed', 'cancelled', 'canceled', 'draft', 'media_import_failed'].includes(String(status ?? '').toLowerCase())
    const { data: rows } = await service.from('postpulse_posts').select('scheduled_for,status').gte('scheduled_for', new Date().toISOString())
    const occupied = (rows ?? []).filter(row => active(row.status) && row.scheduled_for).map(row => new Date(String(row.scheduled_for)).getTime())
    try {
      const remote = await listScheduledPosts()
      occupied.push(...remote.filter(post => active(post.status)).map(post => new Date(post.when).getTime()))
    } catch { /* السجل المحلي يبقى مرجعاً احتياطياً */ }

    const validOccupied = occupied.filter(Number.isFinite)
    const dayCount = (ms: number) => {
      const key = localDateTime(localParts(ms), 0).slice(0, 10)
      return validOccupied.filter(time => localDateTime(localParts(time), 0).slice(0, 10) === key).length
    }
    const slots: Array<{ value: string; label: string; note: string }> = []
    let minimumMs = Date.now() + 60 * 60 * 1000
    for (let index = 0; index < wanted; index += 1) {
      if (index > 0) minimumMs = new Date(`${slots[index - 1].value}:00+03:00`).getTime() + 2 * DAY_MS
      let candidate: string | null = null
      for (let dayOffset = 0; dayOffset < 120 && !candidate; dayOffset += 1) {
        const parts = localParts(minimumMs + dayOffset * DAY_MS)
        const dayStartUtc = Date.UTC(parts.year, parts.month, parts.day) - KSA_MS
        if (dayCount(dayStartUtc) >= MAX_PER_DAY) continue
        for (const hour of GOOD_HOURS) {
          const value = localDateTime(parts, hour)
          const time = new Date(`${value}:00+03:00`).getTime()
          if (time < minimumMs) continue
          if (validOccupied.some(occupiedTime => Math.abs(occupiedTime - time) < 90 * 60 * 1000)) continue
          candidate = value
          validOccupied.push(time)
          break
        }
      }
      if (!candidate) return NextResponse.json({ error: 'تعذر إيجاد مواعيد مناسبة للحملة' }, { status: 409 })
      slots.push({ value: candidate, label: labelFor(candidate), note: index === 0 ? 'أقرب وقت مناسب غير مزدحم' : 'يفصل يومان على الأقل عن المنشور السابق' })
    }
    return NextResponse.json({ slots })
  } catch (error) {
    console.error('Campaign schedule suggestions error:', error)
    return NextResponse.json({ error: 'تعذر اقتراح مواعيد الحملة' }, { status: 500 })
  }
}
