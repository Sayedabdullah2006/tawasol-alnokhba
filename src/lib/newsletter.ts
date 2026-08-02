/**
 * نشرة «النخبة في ٧» الأسبوعية.
 * المرشّحون: السجلّ الموحّد generated_designs (يومية + مستقل + طلبات) مرتّبين بالأحدث.
 * الاختيار: المثبّت يدوياً (in_newsletter) حصراً إن وُجد، وإلا اختيار تلقائي بتنويع
 * الأقسام والأحدث ضمن نافذة الأسبوع. النشر كل جمعة 1م بتوقيت السعودية.
 */
import sharp from 'sharp'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateImageWithOpenAI } from '@/lib/image-generation'
import { getOpenAI, chatComplete } from '@/lib/openai'

const NL_WIDTH = 1080
const NL_HEIGHT = 1920

export interface NewsletterItem {
  index: number
  title: string
  blurb: string
  fullContent: string   // نص الخبر الأصلي الكامل (لإعادة الصياغة منه مباشرة)
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

/** يبني نطاق الأسبوع المنتهي بلحظة جمعة النشر (endUtc). */
export function windowForEnd(endUtc: Date): WeeklyWindow {
  const startUtc = new Date(endUtc.getTime() - 7 * 86400000)
  const s = new Date(startUtc.getTime() + 3 * 3600 * 1000)
  const e = new Date(endUtc.getTime() + 3 * 3600 * 1000)
  const sameMonth = s.getUTCMonth() === e.getUTCMonth()
  const label = sameMonth
    ? `${toArabicDigits(s.getUTCDate())} – ${toArabicDigits(e.getUTCDate())} ${AR_MONTHS[e.getUTCMonth()]} ${toArabicDigits(e.getUTCFullYear())}`
    : `${toArabicDigits(s.getUTCDate())} ${AR_MONTHS[s.getUTCMonth()]} – ${toArabicDigits(e.getUTCDate())} ${AR_MONTHS[e.getUTCMonth()]} ${toArabicDigits(e.getUTCFullYear())}`
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(), label }
}

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
  return windowForEnd(endUtc)
}

/** قائمة جُمَع النشر القادمة (لحظات جمعة 1م KSA) بدءاً من الأقرب. */
export function upcomingFridays(count = 3, ref: Date = new Date()): { endUtc: string; label: string }[] {
  const ksa = new Date(ref.getTime() + 3 * 3600 * 1000)
  const day = ksa.getUTCDay()
  const diff = (5 - day + 7) % 7
  const first = new Date(ksa)
  first.setUTCDate(ksa.getUTCDate() + diff)
  first.setUTCHours(13, 0, 0, 0)
  if (first.getTime() < ksa.getTime()) first.setUTCDate(first.getUTCDate() + 7) // مرّت 1م اليوم
  const out: { endUtc: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const fridayKsa = new Date(first)
    fridayKsa.setUTCDate(first.getUTCDate() + i * 7)
    const endUtc = new Date(fridayKsa.getTime() - 3 * 3600 * 1000)
    out.push({ endUtc: endUtc.toISOString(), label: windowForEnd(endUtc).label })
  }
  return out
}

/** ملخّص مختصر متناسق: أول جملة، أو قصّ عند حدّ كلمة — بلا نقاط «...» وبلا منشن. */
function shortSummary(s: string | null | undefined, max = 95): string {
  if (!s) return ''
  let t = s.replace(/@\S+/g, '').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim()
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

/**
 * مرشّحو النشرة للعرض في اللوحة: تصميم **واحد لكل خبر** (الأحدث أولاً).
 * عند تعدّد تصاميم نفس الخبر يُفضَّل **التصميم المُضمَّن في المجلة** (showcase_designs)،
 * وإلا يُؤخذ تصميم واحد فقط. المجموعة = العنوان أو صورة المصدر أو الرابط.
 */
export async function getCandidates(limit = 200): Promise<DesignRow[]> {
  const sc = await createServiceRoleClient()
  const [{ data }, { data: feat }] = await Promise.all([
    sc.from('generated_designs').select(SELECT_COLS).order('created_at', { ascending: false }).limit(limit),
    sc.from('showcase_designs').select('cover'),
  ])
  const featured = new Set(((feat ?? []) as { cover: string }[]).map(f => f.cover))
  const rows = (data ?? []) as DesignRow[]

  const map = new Map<string, DesignRow>()
  for (const r of rows) {
    const key = (r.title && r.title.trim()) || r.source_image_url || r.image_url
    const existing = map.get(key)
    if (!existing) { map.set(key, r); continue }
    // فضّل التصميم المُضمَّن في المجلة على الأحدث غير المُضمَّن
    if (featured.has(r.image_url) && !featured.has(existing.image_url)) map.set(key, r)
  }
  // ترتيب الناتج بالأحدث
  return [...map.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
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
    fullContent: (r.content ?? '').trim(),
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
    .map(it => `${it.index}. العنوان البارز: "${it.title}"${it.blurb ? ` — النبذة: "${it.blurb}"` : ''}`)
    .join('\n')
  return [
    `DESIGN TASK — صمّم واجهة مجلّة/جريدة عربية عمودية **إبداعية وعصرية** (editorial magazine cover, not a plain classic newspaper). تكوين فنّي جريء وأنيق غير تقليدي.`,
    `OUTPUT SIZE: vertical poster ${NL_WIDTH}×${NL_HEIGHT} (9:16), ultra-HD, print-quality.`,
    `الاتجاه الإبداعي لهذا الأسبوع: ${direction}.`,
    ``,
    `الإبداع المطلوب: تكوين تحريري ديناميكي — خبر رئيسي (hero) بمساحة درامية كبيرة، وبقية الأخبار بأحجام وأعمدة متفاوتة، مع كتل لونية من الهوية، أشكال هندسية/أقواس ناعمة، عمق وطبقات، فواصل ذهبية رفيعة، تايبوغرافي عربي قوي بأوزان متدرّجة. تجنّب الشبكة المتساوية الجامدة تمامًا.`,
    ``,
    `MASTHEAD (top): شريط علوي صلب بلون الهوية بارتفاع ≈ 300 بكسل، فيه عنوان عربي ضخم "النخبة في ٧" + سطر صغير "نشرة أسبوعية" + نطاق التاريخ "${window.label}" + خط ذهبي فاصل أسفله.`,
    `‼️ الشعار: اترك في يسار الشريط العلوي مساحة مربّعة نظيفة ≈ ٢٦٠×٢٦٠ بكسل خالية تماماً (متمركزة رأسياً) — مخصّصة للشعار الذي يُضاف برمجياً. **بلا أي إطار أو حدود أو مربّع حول هذه المساحة — خلفية صلبة فقط**. لا ترسم أي شعار أو كلمة "FIRST1SAUDI".`,
    ``,
    `=== 🔒 صور الأشخاص — قاعدة حديدية (أهم قاعدة) ===`,
    `‼️ **كل خبر يجب أن تظهر فيه صورته الحقيقية المرفقة**. عدد الصور المرفقة = عدد الأخبار (${items.length})، فلا تترك أي خبر بلا صورة، ولا تجعل أي بطاقة نصاً فقط.`,
    `⛔ استخدم الصور الحقيقية المرفقة كما هي حصراً (نفس الوجه/الملامح). لا تُولّد ولا تختلق أي شخص/وجه، ولا تستبدل، ولا تُجمّل.`,
    `ضع صورة كل خبر بارزة داخل بطاقته (في الأعلى أو الجانب). اربط كل صورة بخبرها المناسب ولا تكرّر صورة.`,
    ``,
    `=== ربط الصور ===`,
    `‼️ الصور المرفقة مرتّبة بترتيب الأخبار تماماً: الصورة رقم N هي صورة الخبر رقم N. التزم بهذا الربط حرفياً ولا تخلط صورة خبر مع خبر آخر.`,
    ``,
    `=== العناوين ===`,
    `‼️ العنوان البارز لكل خبر هو **نص "العنوان البارز" المقتبس أدناه فقط** (وهو يحمل اسم الشخص/الإنجاز). ⛔ لا تعرض اسم القسم أو التصنيف أو أي كلمة مثل (اختراعات/أوائل/بيئة/شهادات/تخرّج/العلوم...) كعنوان أو ترويسة إطلاقاً.`,
    `اكتب نصوص العناوين والنبذ العربية حرفياً بين علامتي اقتباس كما هي:`,
    list,
    ``,
    `🔒 BRAND IDENTITY (FIRST1SAUDI): Deep teal #0A2D35–#0D3D47 · Saudi green #2D8B3F–#3A9B4F · gold #FFD700 · white.`,
    `FOOTER: شريط إلزامي فيه أيقونات X وInstagram وLinkedIn وFacebook وTikTok كاملة وبالحجم نفسه، ثم "@First1Saudi".`,
    `قواعد: نصوص عربية حادّة متّصلة صحيحة الاتجاه (RTL) وحرفية. كل نبذة جملة مكتملة المعنى. لا تختلق نصاً. لا نِسب مئوية. لا إيموجي. لا نقاط «...». لا منشن (@) ولا أسماء أقسام في التصميم.`,
  ].join('\n')
}

/**
 * يركّب شعار First1Saudi **كما هو محفوظ** (بلا أي تفريغ) أعلى يسار البوستر بمكان
 * وحجم ثابتين دائماً، ضمن الزاوية النظيفة المحجوزة له في التصميم.
 */
async function compositeBrandLogo(poster: Buffer): Promise<Buffer> {
  try {
    const sc = await createServiceRoleClient()
    const { data: brand } = await sc.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
    const url = brand?.first1saudi_logo_url
    if (!url) return poster
    const r = await fetch(url)
    if (!r.ok) return poster
    const logo = await sharp(Buffer.from(await r.arrayBuffer())).resize({ width: 200 }).png().toBuffer()
    const meta = await sharp(logo).metadata()
    const h = meta.height ?? 200
    const BAND = 300 // ارتفاع الشريط العلوي المتّفق عليه في البرومبت
    const top = Math.max(28, Math.round(BAND / 2 - h / 2)) // توسيط رأسي داخل الشريط
    return await sharp(poster).composite([{ input: logo, top, left: 60 }]).png().toBuffer()
  } catch {
    return poster
  }
}

function defaultCaption(w: WeeklyWindow): string {
  return `🗞️ النخبة في ٧ — ${w.label}\nأبرز إنجازات الأسبوع في لقطة واحدة.\n#أول_سعودي #First1Saudi`
}

/** يعيد صياغة نبذة كل خبر كجملة عربية مكتملة مختصرة بلا منشن/هاشتاق/نقاط. */
async function refineBlurbs(items: NewsletterItem[]): Promise<string[]> {
  try {
    const openai = getOpenAI()
    // نمرّر نص الخبر الأصلي الكامل ليُعيد الصياغة منه مباشرة (لا من نص مقتطع/تصميم)
    const input = items
      .map((it, i) => `${i + 1}. العنوان: ${it.title}\nنص الخبر الأصلي: ${(it.fullContent || it.blurb || it.title).slice(0, 600)}`)
      .join('\n\n')
    const completion = await chatComplete(openai, {
      model: 'gpt-5.5',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'لكل خبر اقرأ «نص الخبر الأصلي» وأعد صياغته في جملة عربية واحدة صحيحة لغوياً ومكتملة المعنى تلخّص جوهر الإنجاز، مختصرة (٨–١٦ كلمة)، واضحة وجذّابة. اعتمد على نص الخبر الأصلي فقط، لا تنسخ نصاً ناقصاً ولا تخترع معلومات. بلا منشن (@) ولا هاشتاقات ولا نقاط حذف. أعد JSON {"blurbs":["...", ...]} بنفس عدد وترتيب المدخلات حصراً.',
        },
        { role: 'user', content: input },
      ],
    })
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
    if (Array.isArray(parsed?.blurbs) && parsed.blurbs.length === items.length) {
      return parsed.blurbs.map((b: unknown) => String(b).replace(/@\S+/g, '').replace(/#\S+/g, '').trim())
    }
  } catch { /* احتياط: النبذة الأصلية */ }
  return items.map(it => it.blurb)
}

/** يولّد نصاً مرافقاً تشويقياً يلخّص النشرة (يُعرض ويُنشر مع البوستر). */
async function generateCaption(window: WeeklyWindow, items: NewsletterItem[]): Promise<string> {
  try {
    const openai = getOpenAI()
    const titles = items.map((it, i) => `${i + 1}. ${it.title}`).join('\n')
    const completion = await chatComplete(openai, {
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

/** يجلب عناصر النشرة من معرّفات تصاميم محددة (بترتيب الاختيار). */
export async function getItemsByIds(ids: string[]): Promise<NewsletterItem[]> {
  if (!ids.length) return []
  const sc = await createServiceRoleClient()
  const { data } = await sc.from('generated_designs').select(SELECT_COLS).in('id', ids)
  const map = new Map(((data ?? []) as DesignRow[]).map(r => [r.id, r]))
  const rows = ids.map(id => map.get(id)).filter((r): r is DesignRow => !!r)
  return rows.map((r, i) => ({
    index: i + 1,
    title: (r.title ?? '').trim() || 'إنجاز سعودي',
    blurb: shortSummary(r.content),
    fullContent: (r.content ?? '').trim(),
    category: (r.category && String(r.category).trim()) || 'منوّعات',
    image: r.image_url,
    sourceImage: r.source_image_url ?? null,
  }))
}

/**
 * يولّد بوستر نشرة الأسبوع عبر OpenAI Images ويخزّنه كصف في newsletters.
 * opts.ids: تصاميم مختارة يدوياً (من البوب-أب). opts.endUtc: جمعة النشر المستهدفة.
 * opts.status: 'draft' (معاينة) أو 'scheduled'.
 */
export async function generateNewsletterPoster(opts?: {
  limit?: number; ref?: Date; ids?: string[]; endUtc?: string; status?: 'draft' | 'scheduled'
}): Promise<{
  id: string; imageUrl: string; window: WeeklyWindow; items: NewsletterItem[]; direction: string; caption: string
}> {
  const window = opts?.endUtc ? windowForEnd(new Date(opts.endUtc)) : getWeeklyWindow(opts?.ref)
  const items = opts?.ids?.length
    ? await getItemsByIds(opts.ids)
    : (await getWeeklyItems(opts?.limit ?? 7, opts?.ref)).items
  if (!items.length) throw new Error('لا توجد أخبار/تصاميم متاحة لهذا الأسبوع')

  // إعادة صياغة النبذ كجُمل مكتملة بلا منشن قبل بناء البرومبت
  const refined = await refineBlurbs(items)
  refined.forEach((b, i) => { if (b) items[i].blurb = b })

  const direction = NEWSLETTER_DIRECTIONS[weeklySeed(window) % NEWSLETTER_DIRECTIONS.length]
  const prompt = buildNewsletterPrompt(window, items, direction)
  const refs = items.map(i => i.sourceImage || i.image).filter((u): u is string => !!u).slice(0, 8)

  const { b64 } = await generateImageWithOpenAI(prompt, refs, { aspectRatio: '9:16' })
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

  const { data: inserted } = await service.from('newsletters').insert({
    label: window.label,
    start_utc: window.startUtc,
    end_utc: window.endUtc,
    scheduled_for: window.endUtc,
    status: opts?.status ?? 'draft',
    direction,
    image_url: pub.publicUrl,
    caption,
    items: items as unknown as object,
  }).select('id').single()

  return { id: inserted?.id ?? '', imageUrl: pub.publicUrl, window, items, direction, caption }
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
