/**
 * نشرة «النخبة في ٧» الأسبوعية — تجميع أبرز أخبار الأسبوع.
 *
 * النافذة: من الجمعة 1:00م (الأسبوع الماضي) إلى الجمعة 1:00م (يوم النشر) بتوقيت
 * السعودية (UTC+3) — أي الجمعة 10:00 UTC. تُجمَع العناصر من خطة النشر اليومية
 * (social_schedule) التي تملك تصميماً، وتُرتَّب بتنويع الأقسام والأحدث.
 */
import sharp from 'sharp'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateImageWithGemini } from '@/lib/gemini'

// مقاس بوستر النشرة (عمودي صحفي)
const NL_WIDTH = 1080
const NL_HEIGHT = 1920

// اتجاهات تصميم متنوّعة — يُختار واحد كل أسبوع (بذرة أسبوعية) فيتجدّد الشكل.
export const NEWSLETTER_DIRECTIONS: string[] = [
  'صحيفة كلاسيكية أنيقة بأعمدة وفواصل رفيعة',
  'مجلة عصرية بشبكة Bento غير متساوية',
  'موزاييك متداخل انسيابي بأحجام متفاوتة',
  'بطل علوي كبير + شبكة أخبار أسفله',
  'إنفوجرافيك تحريري بخطوط وأيقونات',
  'كولاج صحفي ديناميكي بزوايا وميلان خفيف',
  'تصميم مينمال فاخر بمساحات بيضاء وتايبوغرافي قوي',
  'طبقات عمق وتدرّجات سينمائية',
]

// بذرة أسبوعية ثابتة (عدد الأسابيع منذ حقبة) لاختيار اتجاه مختلف كل جمعة.
function weeklySeed(window: WeeklyWindow): number {
  const t = new Date(window.endUtc).getTime()
  return Math.floor(t / (7 * 86400000))
}

function buildNewsletterPrompt(window: WeeklyWindow, items: NewsletterItem[], direction: string): string {
  const list = items
    .map(it => `${it.index}. العنوان: "${it.title}"${it.blurb ? ` — نبذة: "${it.blurb}"` : ''} [القسم: ${it.category}]`)
    .join('\n')
  return [
    `DESIGN TASK — create ONE vertical WEEKLY NEWSPAPER/MAGAZINE digest poster (an editorial composition, NOT editing a single photo).`,
    `OUTPUT SIZE: vertical poster ${NL_WIDTH}×${NL_HEIGHT} (9:16), ultra-HD.`,
    ``,
    `MASTHEAD (top): large bold Arabic title "النخبة في ٧" + small subtitle "نشرة أسبوعية" + date range "${window.label}". Add the FIRST1SAUDI logo space top corner.`,
    ``,
    `LAYOUT — اجعلها انسيابية كصحيفة حقيقية وفق هذا الاتجاه لهذا الأسبوع: «${direction}». أحجام متفاوتة، تدفّق تحريري، لا أقسام متساوية جامدة.`,
    `رتّب ${items.length} أخبار، لكل خبر: استخدم إحدى الصور الحقيقية المرفقة كصورة الخبر، مع عنوانه العربي حرفياً ونبذته المختصرة. اربط كل صورة بخبر مناسب.`,
    ``,
    `الأخبار (اكتب نصوصها العربية حرفياً بين علامتي اقتباس كما هي):`,
    list,
    ``,
    `🔒 BRAND IDENTITY (FIRST1SAUDI): Deep teal #0A2D35–#0D3D47 · Saudi green #2D8B3F–#3A9B4F · gold #FFD700 · white. خلفية داكنة راقية.`,
    `🔒 احتفظ بالأشخاص في الصور الحقيقية كما هم تماماً (لا تشويه للوجوه/الملامح).`,
    `FOOTER: شريط منحنٍ داكن فيه أيقونات سوشال + "@First1Saudi".`,
    ``,
    `قواعد: كل النصوص العربية حادّة ومتّصلة وصحيحة الاتجاه (RTL) وحرفية كما وردت. لا تختلق نصاً. لا نِسب مئوية. لا إيموجي داخل التصميم.`,
  ].join('\n')
}

/** يولّد بوستر نشرة الأسبوع عبر Gemini (باتجاه مختلف كل أسبوع) ويخزّنه. */
export async function generateNewsletterPoster(opts?: { limit?: number; ref?: Date }): Promise<{
  imageUrl: string; window: WeeklyWindow; items: NewsletterItem[]; direction: string
}> {
  const { window, items } = await getWeeklyItems(opts?.limit ?? 7, opts?.ref)
  if (!items.length) throw new Error('لا توجد أخبار ضمن نافذة هذا الأسبوع')

  const direction = NEWSLETTER_DIRECTIONS[weeklySeed(window) % NEWSLETTER_DIRECTIONS.length]
  const prompt = buildNewsletterPrompt(window, items, direction)
  // نمرّر الصور الحقيقية (المصدر) كمراجع، وإلا التصاميم
  const refs = items.map(i => i.sourceImage || i.image).filter((u): u is string => !!u).slice(0, 8)

  const { b64 } = await generateImageWithGemini(prompt, refs)
  const raw = Buffer.from(b64, 'base64')
  const poster = await sharp(raw).resize(NL_WIDTH, NL_HEIGHT, { fit: 'cover', position: 'top' }).png().toBuffer()

  const service = await createServiceRoleClient()
  const path = `newsletter-${Date.now()}.png`
  const { error: upErr } = await service.storage.from('content-images').upload(path, poster, { contentType: 'image/png' })
  if (upErr) throw new Error(`فشل رفع البوستر: ${upErr.message}`)
  const { data: pub } = service.storage.from('content-images').getPublicUrl(path)

  await service.from('newsletters').insert({
    label: window.label,
    start_utc: window.startUtc,
    end_utc: window.endUtc,
    direction,
    image_url: pub.publicUrl,
    items: items as unknown as object,
  })

  return { imageUrl: pub.publicUrl, window, items, direction }
}

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
