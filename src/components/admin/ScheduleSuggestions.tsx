'use client'

import { useEffect, useState } from 'react'

/**
 * مقترحات مواعيد للجدولة: يقرأ المنشورات المجدولة الحالية ويقترح أقرب المواعيد
 * الفارغة أو الأقل ازدحاماً (بتوقيت السعودية). عند اختيار مقترح يُملأ حقل الموعد.
 * يُستخدم في كل نافذة بها زر جدولة.
 */

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
// أوقات نشر جيدة على السوشال (توقيت السعودية) — تُخلط لتنويع الأوقات في كل مرة.
const BEST_HOURS = [9, 11, 13, 16, 18, 19, 20, 21, 22]
const MAX_PER_DAY = 3 // يُقترح اليوم ما لم يبلغ 3 منشورات مجدولة
// نافذة بحث واسعة (وليست ثابتة عند 30 يوماً) — تضمن إيجاد أيام فارغة حتى لو
// امتلأت الأيام القريبة بالجدولة، بدل أن يتقلّص عدد المقترحات الفارغة تدريجياً.
const HARD_CAP_DAYS = 120
const KSA_MS = 3 * 3600 * 1000

interface Slot { value: string; label: string; note: string; empty: boolean }

const p2 = (n: number) => String(n).padStart(2, '0')
const hour12 = (h: number) => { const am = h < 12; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:00 ${am ? 'ص' : 'م'}` }
const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

interface Day { Y: number; M: number; D: number; wd: number; dens: number }

/** يحاول تعيين موعد لكل يوم من `candidates` (بالترتيب) حتى يبلغ `want`، بأوقات لا تتكرر. */
function assignSlots(candidates: Day[], want: number, pool: number[], usedHours: Set<number>, existingMs: number[], nowMs: number): Slot[] {
  const out: Slot[] = []
  for (const d of candidates) {
    if (out.length >= want) break
    for (const h of pool) {
      if (usedHours.has(h)) continue
      const utcMs = Date.UTC(d.Y, d.M, d.D, h, 0, 0) - KSA_MS
      if (utcMs < nowMs + 60 * 60 * 1000) continue
      if (existingMs.some(ms => Math.abs(ms - utcMs) < 90 * 60 * 1000)) continue
      usedHours.add(h)
      out.push({
        value: `${d.Y}-${p2(d.M + 1)}-${p2(d.D)}T${p2(h)}:00`,
        label: `${AR_DAYS[d.wd]} ${d.D} ${AR_MONTHS[d.M]} · ${hour12(h)}`,
        note: d.dens === 0 ? 'يوم فارغ' : `${d.dens} منشور`,
        empty: d.dens === 0,
      })
      break
    }
  }
  return out
}

/**
 * يبني `count` مقترحات كمزيج متوازن **ثابت دائماً**: نصف في أيام فيها منشورات
 * (لكن أقل من 3) ونصف في أيام فارغة — حتى لو امتلأت الأيام القريبة بالجدولة،
 * يوسّع البحث (حتى 120 يوماً) لإيجاد أيام فارغة بدل تقليص حصتها.
 */
function buildSuggestions(existingISO: string[], count = 6): Slot[] {
  const nowMs = Date.now()
  const existingMs = existingISO.map(s => Date.parse(s)).filter(n => !Number.isNaN(n))

  const dayKey = (ms: number) => { const d = new Date(ms + KSA_MS); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` }
  const density: Record<string, number> = {}
  for (const ms of existingMs) { const k = dayKey(ms); density[k] = (density[k] ?? 0) + 1 }

  const wantEmpty = Math.ceil(count / 2)
  const wantWithPosts = count - wantEmpty
  // مخزون مضاعف من كل فئة (احتياط لأيام يتعذّر فيها إيجاد ساعة صالحة)
  const bufferEmpty = wantEmpty * 3
  const bufferWithPosts = wantWithPosts * 3

  const todayK = new Date(nowMs + KSA_MS)
  const withPosts: Day[] = []
  const empty: Day[] = []
  for (let off = 0; off < HARD_CAP_DAYS; off++) {
    if (withPosts.length >= bufferWithPosts && empty.length >= bufferEmpty) break
    const base = new Date(Date.UTC(todayK.getUTCFullYear(), todayK.getUTCMonth(), todayK.getUTCDate() + off))
    const Y = base.getUTCFullYear(), M = base.getUTCMonth(), D = base.getUTCDate()
    const dens = density[`${Y}-${p2(M + 1)}-${p2(D)}`] ?? 0
    if (dens >= MAX_PER_DAY) continue
    const day: Day = { Y, M, D, wd: base.getUTCDay(), dens }
    if (dens === 0) { if (empty.length < bufferEmpty) empty.push(day) }
    else if (withPosts.length < bufferWithPosts) withPosts.push(day)
  }

  const pool = shuffle(BEST_HOURS)
  const usedHours = new Set<number>()
  let out = [
    ...assignSlots(withPosts, wantWithPosts, pool, usedHours, existingMs, nowMs),
    ...assignSlots(empty, wantEmpty, pool, usedHours, existingMs, nowMs),
  ]
  // تعويض أي نقص (تعذّر إيجاد ساعة صالحة لبعض الأيام) من بقية المرشّحين المخزّنين
  if (out.length < count) {
    const leftovers = [...withPosts.slice(wantWithPosts), ...empty.slice(wantEmpty)]
    out = out.concat(assignSlots(leftovers, count - out.length, pool, usedHours, existingMs, nowMs))
  }
  // ترتيب العرض بالأقرب زمنياً
  return out.sort((a, b) => a.value.localeCompare(b.value))
}

export default function ScheduleSuggestions({ value, onPick }: { value?: string; onPick: (v: string) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null)

  useEffect(() => {
    let alive = true
    // نستبعد الحالات الفاشلة/غير المكتملة من حساب الازدحام — لم تُنشر فعلياً فلا يجب أن تحجز الموعد.
    const FAILED = new Set(['failed', 'cancelled', 'canceled', 'draft', 'media_import_failed'])
    fetch('/api/admin/schedule')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => {
        if (!alive) return
        const when = (d.items ?? [])
          .filter((it: { status?: string }) => !FAILED.has(String(it.status || '').toLowerCase()))
          .map((it: { when?: string }) => it.when)
          .filter(Boolean)
        setSlots(buildSuggestions(when, 6))
      })
      .catch(() => { if (alive) setSlots(buildSuggestions([], 6)) })
    return () => { alive = false }
  }, [])

  if (!slots || !slots.length) return null
  const emptyCount = slots.filter(s => s.empty).length
  const busyCount = slots.length - emptyCount
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">
        💡 مواعيد مقترحة — {busyCount > 0 && <span>{busyCount} في أيام فيها منشورات</span>}
        {busyCount > 0 && emptyCount > 0 && ' · '}
        {emptyCount > 0 && <span className="font-bold text-green-700">{emptyCount} في أيام فارغة 🌿</span>}:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {slots.map(s => {
          const on = value === s.value
          return (
            <button key={s.value} type="button" onClick={() => onPick(s.value)}
              className={`text-[11px] rounded-lg border-2 px-2.5 py-1.5 text-right transition ${
                on
                  ? 'border-green bg-green/15 ring-1 ring-green/40'
                  : s.empty
                    ? 'border-green-400 bg-green-50 hover:bg-green-100'
                    : 'border-border bg-cream hover:bg-border/30'
              }`}>
              <span className="block font-bold text-dark">{s.label}</span>
              <span className={`block ${s.empty ? 'font-bold text-green-700' : 'text-muted'}`}>
                {s.empty ? '🌿 يوم فارغ' : s.note}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
