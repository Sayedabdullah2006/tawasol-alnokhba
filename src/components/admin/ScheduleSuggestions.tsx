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
const BEST_HOURS = [11, 13, 16, 19, 20, 21, 22]
const MAX_PER_DAY = 3 // يُقترح اليوم ما لم يبلغ 3 منشورات مجدولة
const KSA_MS = 3 * 3600 * 1000

interface Slot { value: string; label: string; note: string; empty: boolean }

const p2 = (n: number) => String(n).padStart(2, '0')
const hour12 = (h: number) => { const am = h < 12; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:00 ${am ? 'ص' : 'م'}` }
const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

/**
 * يبني `count` مقترحات على **أيام مختلفة وأوقات مختلفة**: أقرب الأيام التي فيها أقل
 * من 3 منشورات، مع وقت مختلف لكل مقترح من مجموعة أفضل أوقات النشر (مخلوطة).
 */
function buildSuggestions(existingISO: string[], count = 3): Slot[] {
  const nowMs = Date.now()
  const existingMs = existingISO.map(s => Date.parse(s)).filter(n => !Number.isNaN(n))

  const dayKey = (ms: number) => { const d = new Date(ms + KSA_MS); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` }
  const density: Record<string, number> = {}
  for (const ms of existingMs) { const k = dayKey(ms); density[k] = (density[k] ?? 0) + 1 }

  const pool = shuffle(BEST_HOURS)
  const usedHours = new Set<number>()
  const todayK = new Date(nowMs + KSA_MS)
  const out: Slot[] = []

  for (let off = 0; off < 21 && out.length < count; off++) {
    const base = new Date(Date.UTC(todayK.getUTCFullYear(), todayK.getUTCMonth(), todayK.getUTCDate() + off))
    const Y = base.getUTCFullYear(), M = base.getUTCMonth(), D = base.getUTCDate(), wd = base.getUTCDay()
    const dens = density[`${Y}-${p2(M + 1)}-${p2(D)}`] ?? 0
    if (dens >= MAX_PER_DAY) continue // يوم مزدحم — نتخطّاه
    // وقت مختلف لكل مقترح: أول ساعة غير مستخدمة، مستقبلية، وغير قريبة من منشور موجود
    for (const h of pool) {
      if (usedHours.has(h)) continue
      const utcMs = Date.UTC(Y, M, D, h, 0, 0) - KSA_MS
      if (utcMs < nowMs + 60 * 60 * 1000) continue
      if (existingMs.some(ms => Math.abs(ms - utcMs) < 90 * 60 * 1000)) continue
      usedHours.add(h)
      out.push({
        value: `${Y}-${p2(M + 1)}-${p2(D)}T${p2(h)}:00`,
        label: `${AR_DAYS[wd]} ${D} ${AR_MONTHS[M]} · ${hour12(h)}`,
        note: dens === 0 ? 'يوم فارغ' : `${dens} منشور`,
        empty: dens === 0,
      })
      break // مقترح واحد (يوم واحد) لكل تكرار
    }
  }
  return out
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
