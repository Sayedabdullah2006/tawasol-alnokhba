'use client'

import { useEffect, useState } from 'react'

/**
 * مقترحات مواعيد للجدولة: يقرأ المنشورات المجدولة الحالية ويقترح أقرب المواعيد
 * الفارغة أو الأقل ازدحاماً (بتوقيت السعودية). عند اختيار مقترح يُملأ حقل الموعد.
 * يُستخدم في كل نافذة بها زر جدولة.
 */

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const PREFERRED_HOURS = [10, 13, 19, 21] // أوقات نشر مناسبة (توقيت السعودية)
const KSA_MS = 3 * 3600 * 1000

interface Slot { value: string; label: string; note: string; empty: boolean }

const p2 = (n: number) => String(n).padStart(2, '0')
const hour12 = (h: number) => { const am = h < 12; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:00 ${am ? 'ص' : 'م'}` }

/** يبني حتى `count` مقترحات: أقرب أيام فارغة/أقل ازدحاماً + أنسب وقت في كل يوم. */
function buildSuggestions(existingISO: string[], count = 3): Slot[] {
  const nowMs = Date.now()
  const existingMs = existingISO.map(s => Date.parse(s)).filter(n => !Number.isNaN(n))

  const dayKey = (ms: number) => { const d = new Date(ms + KSA_MS); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` }
  const density: Record<string, number> = {}
  for (const ms of existingMs) { const k = dayKey(ms); density[k] = (density[k] ?? 0) + 1 }

  const todayK = new Date(nowMs + KSA_MS)
  const out: { ms: number; value: string; label: string; note: string; empty: boolean; dens: number }[] = []
  for (let off = 0; off < 21; off++) {
    const base = new Date(Date.UTC(todayK.getUTCFullYear(), todayK.getUTCMonth(), todayK.getUTCDate() + off))
    const Y = base.getUTCFullYear(), M = base.getUTCMonth(), D = base.getUTCDate(), wd = base.getUTCDay()
    const dens = density[`${Y}-${p2(M + 1)}-${p2(D)}`] ?? 0
    for (const h of PREFERRED_HOURS) {
      const utcMs = Date.UTC(Y, M, D, h, 0, 0) - KSA_MS
      if (utcMs < nowMs + 60 * 60 * 1000) continue // مستقبلي + هامش ساعة
      if (existingMs.some(ms => Math.abs(ms - utcMs) < 90 * 60 * 1000)) continue // ليس قريباً من منشور
      out.push({
        ms: utcMs,
        value: `${Y}-${p2(M + 1)}-${p2(D)}T${p2(h)}:00`,
        label: `${AR_DAYS[wd]} ${D} ${AR_MONTHS[M]} · ${hour12(h)}`,
        note: dens === 0 ? 'يوم فارغ' : `${dens} منشور`,
        empty: dens === 0, dens,
      })
      break // أفضل وقت واحد لكل يوم
    }
  }
  // الأقل ازدحاماً أولاً ثم الأقرب زمنياً
  out.sort((a, b) => a.dens - b.dens || a.ms - b.ms)
  return out.slice(0, count).map(({ value, label, note, empty }) => ({ value, label, note, empty }))
}

export default function ScheduleSuggestions({ value, onPick }: { value?: string; onPick: (v: string) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/schedule')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (alive) setSlots(buildSuggestions((d.items ?? []).map((it: { when?: string }) => it.when).filter(Boolean), 3)) })
      .catch(() => { if (alive) setSlots(buildSuggestions([], 3)) })
    return () => { alive = false }
  }, [])

  if (!slots || !slots.length) return null
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">💡 مواعيد مقترحة (الأقرب والأقل ازدحاماً):</p>
      <div className="flex flex-wrap gap-1.5">
        {slots.map(s => {
          const on = value === s.value
          return (
            <button key={s.value} type="button" onClick={() => onPick(s.value)}
              className={`text-[11px] rounded-lg border px-2.5 py-1.5 text-right transition ${on ? 'border-green bg-green/10 ring-1 ring-green/30' : 'border-green/40 bg-green/5 hover:bg-green/10'}`}>
              <span className="block font-bold text-dark">{s.label}</span>
              <span className={`block ${s.empty ? 'text-green-700' : 'text-muted'}`}>{s.note}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
