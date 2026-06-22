/**
 * نشرة «النخبة في ٧» الأسبوعية — تجميع أبرز أخبار الأسبوع.
 *
 * النافذة: من الجمعة 1:00م (الأسبوع الماضي) إلى الجمعة 1:00م (يوم النشر) بتوقيت
 * السعودية (UTC+3) — أي الجمعة 10:00 UTC. تُجمَع العناصر من خطة النشر اليومية
 * (social_schedule) التي تملك تصميماً، وتُرتَّب بتنويع الأقسام والأحدث.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'

export interface NewsletterItem {
  index: number          // ترتيب العرض (1..N)
  title: string
  blurb: string
  category: string
  image: string          // التصميم/الصورة المعروضة
  sourceImage: string | null
}

export interface WeeklyWindow {
  startUtc: string
  endUtc: string
  // نطاق العرض بالعربية، مثال: «١٤ – ٢٠ يونيو ٢٠٢٦»
  label: string
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const toArabicDigits = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)])

/** أحدث «جمعة 1:00م بتوقيت السعودية» (= جمعة 10:00 UTC) ماضية أو حالية. */
export function getWeeklyWindow(ref: Date = new Date()): WeeklyWindow {
  // نعمل بوقت KSA: نزيح الساعة +3 لتمثّل جدار ساعة السعودية بحقول UTC.
  const ksa = new Date(ref.getTime() + 3 * 3600 * 1000)
  const day = ksa.getUTCDay() // 0=أحد .. 5=جمعة
  // أقرب جمعة سابقة/حالية
  let diff = (day - 5 + 7) % 7
  const candidate = new Date(ksa)
  candidate.setUTCDate(ksa.getUTCDate() - diff)
  candidate.setUTCHours(13, 0, 0, 0) // 1:00م KSA
  // إن كانت جمعة اليوم لكن قبل 1م، نأخذ جمعة الأسبوع الماضي
  if (candidate.getTime() > ksa.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() - 7)
  }
  // تحويل جدار ساعة KSA إلى لحظة UTC فعلية (-3 ساعات)
  const endUtc = new Date(candidate.getTime() - 3 * 3600 * 1000)
  const startUtc = new Date(endUtc.getTime() - 7 * 86400000)

  // وسم النطاق (بداية → نهاية) بأرقام عربية
  const s = new Date(startUtc.getTime() + 3 * 3600 * 1000) // KSA wall
  const e = new Date(endUtc.getTime() + 3 * 3600 * 1000)
  const sameMonth = s.getUTCMonth() === e.getUTCMonth()
  const label = sameMonth
    ? `${toArabicDigits(s.getUTCDate())} – ${toArabicDigits(e.getUTCDate())} ${AR_MONTHS[e.getUTCMonth()]} ${toArabicDigits(e.getUTCFullYear())}`
    : `${toArabicDigits(s.getUTCDate())} ${AR_MONTHS[s.getUTCMonth()]} – ${toArabicDigits(e.getUTCDate())} ${AR_MONTHS[e.getUTCMonth()]} ${toArabicDigits(e.getUTCFullYear())}`

  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(), label }
}

function excerpt(s: string | null | undefined, n = 110): string {
  if (!s) return ''
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n).trim()}…` : clean
}

/** يجمع أبرز عناصر الأسبوع ويعيد حتى limit عنصراً وفق آلية اختيار محددة:
 *  1) العناصر التي علّمها الأدمن «ضمّ للنشرة» (in_newsletter) — بترتيبه إن وُجد.
 *  2) ثم تُكمَّل البقية تلقائياً بتنويع الأقسام ثم الأحدث.
 */
export async function getWeeklyItems(limit = 7, ref?: Date): Promise<{ window: WeeklyWindow; items: NewsletterItem[] }> {
  const window = getWeeklyWindow(ref)
  const sc = await createServiceRoleClient()
  const { data } = await sc
    .from('social_schedule')
    .select('id, post_title, category, source_content, source_image_url, design_image_url, created_at, in_newsletter, newsletter_rank')
    .not('design_image_url', 'is', null)
    .gte('created_at', window.startUtc)
    .lte('created_at', window.endUtc)
    .order('created_at', { ascending: false })
    .limit(80)

  const rows = (data ?? []).filter(r => r.design_image_url)

  // 1) المُرشَّحون يدوياً (in_newsletter) — بترتيب newsletter_rank ثم الأحدث
  const marked = rows
    .filter(r => r.in_newsletter)
    .sort((a, b) => {
      const ra = a.newsletter_rank ?? 9999
      const rb = b.newsletter_rank ?? 9999
      if (ra !== rb) return ra - rb
      return String(b.created_at).localeCompare(String(a.created_at))
    })

  const picked: typeof rows = [...marked].slice(0, limit)

  // 2) إكمال تلقائي بتنويع الأقسام ثم الأحدث
  if (picked.length < limit) {
    const seenCat = new Set(picked.map(r => (r.category && String(r.category).trim()) || 'منوّعات'))
    for (const r of rows) {
      if (picked.includes(r)) continue
      const cat = (r.category && String(r.category).trim()) || 'منوّعات'
      if (!seenCat.has(cat)) { seenCat.add(cat); picked.push(r); if (picked.length >= limit) break }
    }
  }
  if (picked.length < limit) {
    for (const r of rows) {
      if (picked.includes(r)) continue
      picked.push(r)
      if (picked.length >= limit) break
    }
  }

  const items: NewsletterItem[] = picked.map((r, i) => ({
    index: i + 1,
    title: (r.post_title as string)?.trim() || 'إنجاز سعودي',
    blurb: excerpt(r.source_content as string),
    category: (r.category && String(r.category).trim()) || 'منوّعات',
    image: r.design_image_url as string,
    sourceImage: (r.source_image_url as string) ?? null,
  }))

  return { window, items }
}
