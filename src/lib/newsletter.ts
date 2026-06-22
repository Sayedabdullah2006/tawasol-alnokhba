/**
 * نشرة «النخبة في ٧» الأسبوعية.
 * المرشّحون: السجلّ الموحّد generated_designs (يومية + مستقل + طلبات) مرتّبين بالأحدث.
 * الاختيار: المثبّت يدوياً (in_newsletter) حصراً إن وُجد، وإلا اختيار تلقائي بتنويع
 * الأقسام والأحدث ضمن نافذة الأسبوع. النشر كل جمعة 1م بتوقيت السعودية.
 */
import sharp from 'sharp'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateImageWithGemini } from '@/lib/gemini'
import { getOpenAI } from '@/lib/openai'

const NL_WIDTH = 1080
const NL_HEIGHT = 1920

export interface NewsletterItem {
  index: number
  title: string
  blurb: string
  category: string
  image: string
  sourceImage: string | null
}

export interface WeeklyWindow {
  startUtc: string
  endUtc: string
  label: string
}

interface DesignRow {
  id: string
  source: string
  title: string | null
  content: string | null
  category: string | null
  image_url: string
  source_image_url: string | null
  in_newsletter: boolean
  newsletter_rank: number | null
  created_at: string
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const toArabicDigits = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)])

/** أحدث «جمعة 1:00م بتوقيت السعودية» (= جمعة 10:00 UTC) ماضية أو حالية + نطاق الأسبوع. */
export function getWeeklyWindow(ref: Date = new Date()): WeeklyWindow {
  const ksa = new Date(ref.getTime() + 3 * 3600 * 1000)
  const day = ksa.getUTCDay()
  const diff = (day - 5 + 7) % 7
  const candidate = new Date(ksa)
  candidate.setUTCDate(ksa.getUTCDate() - diff)
  candidate.setUTCHours(13, 0, 0, 0)
  if (candidate.getTime() > ksa.getTime()) candidate.setUTCDate(candidate.getUTCDate() - 7)
  const endUtc = new Date(candidate.getTime() - 3 * 3600 * 1000)
  const startUtc = new Date(endUtc.getTime() - 7 * 86400000)

  const s = new Date(startUtc.getTime() + 3 * 3600 * 1000)
  const e = new Date(endUtc.getTime() + 3 * 3600 * 1000)
  const sameMonth = s.getUTCMonth() === e.getUTCMonth()
  const label = sameMonth
    ? `${toArabicDigits(s.getUTCDate())} – ${toArabicDigits(e.getUTCDate())} ${AR_MONTHS[e.getUTCMonth()]} ${toArabicDigits(e.getUTCFullYear())}`
    : `${toArabicDigits(s.getUTCDate())} ${AR_MONTHS[s.getUTCMonth()]} – ${toArabicDigits(e.getUTCDate())} ${AR_MONTHS[e.getUTCMonth()]} ${toArabicDigits(e.getUTCFullYear())}`
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(), label }
}

/** ملخّص مختصر متناسق: أول جملة، أو قصّ عند حدّ كلمة — بلا نقاط «...». */
function shortSummary(s: string | null | undefined, max = 95): string {
  if (!s) return ''
  let t = s.replace(/\s+/g, ' ').trim()
  // أول جملة (أول نقطة/علامة استفهام/تعجب بعد طول معقول)
  let cut = t.length
  for (const e of ['.', '؟', '!']) {
    const i = t.indexOf(e)
    if (i >= 25 && i < cut) cut = i
  }
  t = t.slice(0, cut).trim()
  if (t.length > max) {
    t = t.slice(0, max)
    const sp = t.lastIndexOf(' ')
    if (sp > 30) t = t.slice(0, sp)
    t = t.trim()
  }
  return t
}

function dedupeByTitle(rows: DesignRow[]): DesignRow[] {
  const seen = new Set<string>()
  const out: DesignRow[] = []
  for (const r of rows) {
    const key = (r.title ?? '').replace(/\s+/g, ' ').trim()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    out.push(r)
  }
  return out
}

const SELECT_COLS = 'id, source, title, content, category, image_url, source_image_url, in_newsletter, newsletter_rank, created_at'

/** مرشّحو النشرة للعرض في اللوحة: كل التصاميم المولّدة، الأحدث أولاً. */
export async function getCandidates(days = 21): Promise<DesignRow[]> {
  const sc = await createServiceRoleClient()
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data } = await sc
    .from('generated_designs')
    .select(SELECT_COLS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(120)
  return dedupeByTitle((data ?? []) as DesignRow[])
}

/** يجمع عناصر النشرة وفق آلية الاختيار. */
export async function getWeeklyItems(limit = 7, ref?: Date): Promise<{ window: WeeklyWindow; items: NewsletterItem[] }> {
  const window = getWeeklyWindow(ref)
  const sc = await createServiceRoleClient()

  // 1) المثبّت يدوياً (in_newsletter) — يُستخدم حصراً إن وُجد
  const { data: pinnedData } = await sc
    .from('generated_designs')
    .select(SELECT_COLS)
    .eq('in_newsletter', true)
    .order('newsletter_rank', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit * 2)
  let chosen = dedupeByTitle((pinnedData ?? []) as DesignRow[]).slice(0, limit)

  // 2) وإلا: اختيار تلقائي ضمن نافذة الأسبوع بتنويع الأقسام ثم الأحدث
  if (!chosen.length) {
    const { data } = await sc
      .from('generated_designs')
      .select(SELECT_COLS)
      .gte('created_at', window.startUtc)
      .lte('created_at', window.endUtc)
      .order('created_at', { ascending: false })
      .limit(80)
    const rows = dedupeByTitle((data ?? []) as DesignRow[])
    const picked: DesignRow[] = []
    const seenCat = new Set<string>()
    for (const r of rows) {
      const cat = (r.category && String(r.category).trim()) || 'منوّعات'
      if (!seenCat.has(cat)) { seenCat.add(cat); picked.push(r); if (picked.length >= limit) break }
    }
    for (const r of rows) {
      if (picked.length >= limit) break
      if (!picked.includes(r)) picked.push(r)
    }
    chosen = picked
  }

  const items: NewsletterItem[] = chosen.map((r, i) => ({
    index: i + 1,
    title: (r.title ?? '').trim() || 'إنجاز سعودي',
    blurb: shortSummary(r.content),
    category: (r.category && String(r.category).trim()) || 'منوّعات',
    image: r.image_url,
    sourceImage: r.source_image_url ?? null,
  }))
  return { window, items }
}

// اتجاهات تصميم متنوّعة — يُختار واحد كل أسبوع فيتجدّد الشكل.
export const NEWSLETTER_DIRECTIONS: string[] = [
  'صحيفة كلاسيكية أنيقة بأعمدة وفواصل رفيعة',
  'مجلة عصرية بشبكة Bento غير متساوية',
  'موزاييك متداخل انسيابي بأحجام متفاوتة',
  'بطل علوي كبير + شبكة أخبار أسفله',
  'إنفوجرافيك تحريري بخطوط وأيقونات',
  'كولاج صحفي ديناميكي بزوايا وميلان خفيف',
  'تصميم مينمال فاخر بمساحات واسعة وتايبوغرافي قوي',
  'طبقات عمق وتدرّجات سينمائية',
]

function weeklySeed(window: WeeklyWindow): number {
  return Math.floor(new Date(window.endUtc).getTime() / (7 * 86400000))
}

function buildNewsletterPrompt(window: WeeklyWindow, items: NewsletterItem[], direction: string): string {
  const list = items
    .map(it => `${it.index}. العنوان: "${it.title}"${it.blurb ? ` — نبذة: "${it.blurb}"` : ''} [القسم: ${it.category}]`)
    .join('\n')
  return [
    `DESIGN TASK — create ONE vertical WEEKLY NEWSPAPER/MAGAZINE digest poster (editorial composition, NOT editing a single photo).`,
    `OUTPUT SIZE: vertical poster ${NL_WIDTH}×${NL_HEIGHT} (9:16), ultra-HD.`,
    ``,
    `MASTHEAD (top): large bold Arabic title "النخبة في ٧" + small subtitle "نشرة أسبوعية" + date range "${window.label}".`,
    `‼️ اترك الزاوية العليا اليسرى فارغة تماماً (سيُضاف الشعار لاحقاً برمجياً). لا ترسم أي شعار أو علامة أو كلمة "FIRST1SAUDI" إطلاقاً.`,
    ``,
    `LAYOUT — انسيابية كصحيفة حقيقية وفق اتجاه هذا الأسبوع: «${direction}». أحجام متفاوتة، تدفّق تحريري، لا أقسام متساوية جامدة.`,
    `رتّب ${items.length} أخبار، لكل خبر: استخدم إحدى الصور الحقيقية المرفقة كصورة الخبر، مع عنوانه ونبذته. اربط كل صورة بخبر مناسب ولا تكرّر أي خبر.`,
    ``,
    `الأخبار (اكتب نصوصها العربية حرفياً بين علامتي اقتباس كما هي):`,
    list,
    ``,
    `🔒 BRAND IDENTITY (FIRST1SAUDI): Deep teal #0A2D35–#0D3D47 · Saudi green #2D8B3F–#3A9B4F · gold #FFD700 · white. خلفية داكنة راقية.`,
    `🔒 احتفظ بالأشخاص في الصور الحقيقية كما هم تماماً (لا تشويه للوجوه).`,
    `FOOTER: شريط منحنٍ داكن فيه أيقونات سوشال + "@First1Saudi".`,
    `قواعد: نصوص عربية حادّة متّصلة صحيحة الاتجاه (RTL) وحرفية. لا تختلق نصاً. لا نِسب مئوية. لا إيموجي داخل التصميم. لا نقاط «...» في النبذ.`,
  ].join('\n')
}

/** يركّب شعار First1Saudi الحقيقي أعلى يسار البوستر (إن وُجد). */
async function compositeBrandLogo(poster: Buffer): Promise<Buffer> {
  try {
    const sc = await createServiceRoleClient()
    const { data: brand } = await sc.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
    const url = brand?.first1saudi_logo_url
    if (!url) return poster
    const r = await fetch(url)
    if (!r.ok) return poster
    const logoBuf = Buffer.from(await r.arrayBuffer())
    const logo = await sharp(logoBuf).resize({ width: 210 }).png().toBuffer()
    return await sharp(poster).composite([{ input: logo, top: 56, left: 56 }]).png().toBuffer()
  } catch {
    return poster
  }
}

function defaultCaption(w: WeeklyWindow): string {
  return `🗞️ النخبة في ٧ — ${w.label}\nأبرز إنجازات الأسبوع في لقطة واحدة.\n#أول_سعودي #First1Saudi`
}

/** يولّد نصاً مرافقاً تشويقياً يلخّص النشرة (يُعرض ويُنشر مع البوستر). */
async function generateCaption(window: WeeklyWindow, items: NewsletterItem[]): Promise<string> {
  try {
    const openai = getOpenAI()
    const titles = items.map((it, i) => `${i + 1}. ${it.title}`).join('\n')
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.5',
      messages: [
        {
          role: 'system',
          content:
            'أنت كاتب محتوى مبدع لحساب First1Saudi. اكتب نصاً مرافقاً لنشرة «النخبة في ٧» الأسبوعية يلخّص أبرز إنجازات الأسبوع بأسلوب تشويقي راقٍ يشدّ القارئ ويحثّه على مشاهدة النشرة. سطران إلى ثلاثة بفصحى جذّابة، التقط الأبرز ولا تعدّد كل العناوين، بلا مبالغة ولا نِسب مئوية، وأنهِ بهاشتاقات #أول_سعودي #First1Saudi.',
        },
        { role: 'user', content: `نطاق الأسبوع: ${window.label}\nعناوين أخبار النشرة:\n${titles}` },
      ],
    })
    return completion.choices[0]?.message?.content?.trim() || defaultCaption(window)
  } catch {
    return defaultCaption(window)
  }
}

/** يولّد بوستر نشرة الأسبوع عبر Gemini (باتجاه مختلف كل أسبوع) ويخزّنه. */
export async function generateNewsletterPoster(opts?: { limit?: number; ref?: Date }): Promise<{
  imageUrl: string; window: WeeklyWindow; items: NewsletterItem[]; direction: string; caption: string
}> {
  const { window, items } = await getWeeklyItems(opts?.limit ?? 7, opts?.ref)
  if (!items.length) throw new Error('لا توجد أخبار/تصاميم متاحة لهذا الأسبوع')

  const direction = NEWSLETTER_DIRECTIONS[weeklySeed(window) % NEWSLETTER_DIRECTIONS.length]
  const prompt = buildNewsletterPrompt(window, items, direction)
  const refs = items.map(i => i.sourceImage || i.image).filter((u): u is string => !!u).slice(0, 8)

  const { b64 } = await generateImageWithGemini(prompt, refs)
  const raw = Buffer.from(b64, 'base64')
  const poster = await sharp(raw).resize(NL_WIDTH, NL_HEIGHT, { fit: 'cover', position: 'top' }).png().toBuffer()
  const withLogo = await compositeBrandLogo(poster)

  // النص المرافق التشويقي (يُولَّد قبل النشر)
  const caption = await generateCaption(window, items)

  const service = await createServiceRoleClient()
  const path = `newsletter-${Date.now()}.png`
  const { error: upErr } = await service.storage.from('content-images').upload(path, withLogo, { contentType: 'image/png' })
  if (upErr) throw new Error(`فشل رفع البوستر: ${upErr.message}`)
  const { data: pub } = service.storage.from('content-images').getPublicUrl(path)

  await service.from('newsletters').insert({
    label: window.label,
    start_utc: window.startUtc,
    end_utc: window.endUtc,
    direction,
    image_url: pub.publicUrl,
    caption,
    items: items as unknown as object,
  })

  return { imageUrl: pub.publicUrl, window, items, direction, caption }
}

/** يسجّل تصميماً مولّداً في السجلّ الموحّد (يُستدعى من المصادر الثلاثة). */
export async function logGeneratedDesign(d: {
  source: 'daily' | 'standalone' | 'request'
  title?: string | null
  content?: string | null
  category?: string | null
  imageUrl: string
  sourceImageUrl?: string | null
  requestId?: string | null
}): Promise<void> {
  try {
    const sc = await createServiceRoleClient()
    await sc.from('generated_designs').insert({
      source: d.source,
      title: d.title ?? null,
      content: d.content ?? null,
      category: d.category ?? null,
      image_url: d.imageUrl,
      source_image_url: d.sourceImageUrl ?? null,
      request_id: d.requestId ?? null,
    })
  } catch { /* تجاهل أخطاء التسجيل */ }
}
