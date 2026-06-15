/**
 * جلب الأخبار من موقع first1saudi.net (ووردبريس) عبر REST API.
 *
 * نستخدم `wp-json/wp/v2/posts?_embed` بدل RSS لأنه يعطي:
 *   - المحتوى الكامل (content.rendered) لا مقتطفاً فقط.
 *   - الصورة البارزة (featured media) — وهي إلزامية لمدخل الاستوديو.
 *   - التصنيفات (للتنويع بين الأخبار المختارة).
 */

const WP_BASE = 'https://first1saudi.net/wp-json/wp/v2'

export interface NewsPost {
  id: number
  url: string
  title: string
  content: string // نص صِرف بلا وسوم HTML
  imageUrl: string // صورة الشخص/الموضوع (بارزة أو من المتن — مضمون عدم الفراغ بعد الفلترة)
  imageSource: 'featured' | 'body' // مصدر الصورة (للشفافية/التشخيص)
  categoryIds: number[]
  categoryNames: string[]
  publishedAt: string
}

/**
 * يستخرج روابط الصور الحقيقية من متن الخبر (وسوم <img>).
 * يستبعد صور الإيموجي (s.w.org) وروابط data: والصور خارج مكتبة الوسائط،
 * ليبقى فقط ما يُرجَّح أنه صورة الشخص/الموضوع.
 */
export function extractContentImages(html: string): string[] {
  const srcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
  return srcs.filter(
    s =>
      !!s &&
      !s.startsWith('data:') &&
      !/s\.w\.org/i.test(s) && // إيموجي ووردبريس
      !/\/emoji\//i.test(s) &&
      /\/wp-content\/uploads\//i.test(s), // من مكتبة وسائط الموقع فقط
  )
}

// ── أدوات تنظيف نص ووردبريس ────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', laquo: '«', raquo: '»', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
}

/** يحوّل HTML من ووردبريس إلى نص عربي صِرف مرتّب. */
export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface WPPost {
  id: number
  link: string
  date: string
  title?: { rendered?: string }
  content?: { rendered?: string }
  categories?: number[]
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url?: string }>
    'wp:term'?: Array<Array<{ id?: number; name?: string; taxonomy?: string }>>
  }
}

function normalize(p: WPPost): NewsPost | null {
  // صورة الشخص/الموضوع: الصورة البارزة أولاً، وإلا أول صورة حقيقية من المتن.
  const featured = p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? ''
  const bodyImages = extractContentImages(p.content?.rendered ?? '')
  const imageUrl = featured || bodyImages[0] || ''
  if (!imageUrl) return null // الاستوديو يتطلب صورة مصدر حقيقية
  const imageSource: 'featured' | 'body' = featured ? 'featured' : 'body'

  const terms = (p._embedded?.['wp:term'] ?? []).flat()
  const cats = terms.filter(t => t?.taxonomy === 'category' && t?.name)
  const title = htmlToPlainText(p.title?.rendered ?? '')
  const content = htmlToPlainText(p.content?.rendered ?? '')
  if (!title || !content) return null

  return {
    id: p.id,
    url: p.link,
    title,
    content,
    imageUrl,
    imageSource,
    categoryIds: p.categories ?? cats.map(c => c.id ?? 0).filter(Boolean),
    categoryNames: cats.map(c => c.name as string),
    publishedAt: p.date,
  }
}

/**
 * يجلب مجموعة من أحدث المنشورات التي تملك صورة بارزة (مرشّحون للاختيار).
 * @param opts.pages عدد الصفحات (كل صفحة perPage منشور) — لتكوين بركة أكبر للتدوير.
 */
export async function fetchCandidatePosts(opts: { perPage?: number; pages?: number } = {}): Promise<NewsPost[]> {
  const perPage = opts.perPage ?? 20
  const pages = opts.pages ?? 1

  // نجلب كل الصفحات بالتوازي لتقليل زمن الانتظار (المصدر قد يكون بطيئاً).
  const pageNums = Array.from({ length: pages }, (_, i) => i + 1)
  const responses = await Promise.all(
    pageNums.map(async page => {
      const url = `${WP_BASE}/posts?_embed=1&per_page=${perPage}&page=${page}&orderby=date&order=desc`
      try {
        const resp = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!resp.ok) return [] as WPPost[] // الصفحة الزائدة ترجع 400 — نتجاهلها
        const posts = (await resp.json()) as WPPost[]
        return Array.isArray(posts) ? posts : []
      } catch {
        return [] as WPPost[]
      }
    }),
  )

  const out: NewsPost[] = []
  for (const posts of responses) {
    for (const p of posts) {
      const n = normalize(p)
      if (n) out.push(n)
    }
  }
  return out
}
