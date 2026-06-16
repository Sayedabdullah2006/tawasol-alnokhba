/**
 * جلب الأخبار من موقع first1saudi.net (ووردبريس) عبر REST API.
 *
 * مهم: الموقع بطيء جداً تجاه خوادم السحابة (~8s لكل طلب من Railway مقابل ~1s محلياً).
 * لذلك نتجنّب `_embed` الثقيل (استجابات ضخمة تتجاوز المهلة)، ونستخدم طلبات خفيفة
 * عبر `_fields`، ونحلّ رابط الصورة البارزة منفصلاً (طلب /media صغير) للأخبار المختارة فقط.
 * كل طلب محاط بمهلة + إعادة محاولة واحدة.
 */

const WP_BASE = 'https://first1saudi.net/wp-json/wp/v2'
const UA = 'Mozilla/5.0 (compatible; First1SaudiBot/1.0; +https://nukhba.media)'
const POST_FIELDS = 'id,link,date,title,content,categories,featured_media'

export interface NewsPost {
  id: number
  url: string
  title: string
  content: string // نص صِرف بلا وسوم HTML
  categoryIds: number[]
  categoryNames: string[]
  publishedAt: string
  featuredMediaId: number
  bodyImages: string[] // صور من متن الخبر (احتياطي إن لم توجد صورة بارزة)
  imageUrl?: string // يُحلّ لاحقاً عبر resolveImageUrl
  imageSource?: 'featured' | 'body'
}

export interface NewsCategory {
  id: number
  name: string
  count: number
}

/** جلب JSON من ووردبريس مع مهلة + إعادة محاولة (الموقع بطيء تجاه السحابة). */
async function wpFetchJson(url: string, timeoutMs = 25000): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), timeoutMs)
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: ctrl.signal,
      })
      clearTimeout(to)
      if (r.ok) return await r.json()
    } catch {
      /* مهلة/خطأ شبكة — نعيد المحاولة مرة */
    }
  }
  return null
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
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * يستخرج روابط الصور الحقيقية من متن الخبر (وسوم <img>).
 * يستبعد صور الإيموجي (s.w.org) وروابط data: والصور خارج مكتبة الوسائط.
 */
export function extractContentImages(html: string): string[] {
  const srcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
  return srcs.filter(
    s =>
      !!s &&
      !s.startsWith('data:') &&
      !/s\.w\.org/i.test(s) &&
      !/\/emoji\//i.test(s) &&
      /\/wp-content\/uploads\//i.test(s),
  )
}

interface WPPostLite {
  id: number
  link: string
  date: string
  title?: { rendered?: string }
  content?: { rendered?: string }
  categories?: number[]
  featured_media?: number
}

/** يبني NewsPost خفيفاً (بلا حلّ صورة بعد). */
function normalizeLite(p: WPPostLite): NewsPost | null {
  if (!p || typeof p.id !== 'number') return null
  const title = htmlToPlainText(p.title?.rendered ?? '')
  const content = htmlToPlainText(p.content?.rendered ?? '')
  if (!title || !content) return null
  return {
    id: p.id,
    url: p.link,
    title,
    content,
    categoryIds: Array.isArray(p.categories) ? p.categories : [],
    categoryNames: [],
    publishedAt: p.date,
    featuredMediaId: typeof p.featured_media === 'number' ? p.featured_media : 0,
    bodyImages: extractContentImages(p.content?.rendered ?? ''),
  }
}

/**
 * يحلّ رابط صورة الخبر: الصورة البارزة (عبر /media) أولاً، وإلا أول صورة من المتن.
 * يحدّث الكائن (imageUrl/imageSource) ويُعيد الرابط، أو null إن تعذّر.
 */
export async function resolveImageUrl(post: NewsPost): Promise<string | null> {
  if (post.featuredMediaId > 0) {
    const media = (await wpFetchJson(
      `${WP_BASE}/media/${post.featuredMediaId}?_fields=source_url`,
      20000,
    )) as { source_url?: string } | null
    if (media?.source_url) {
      post.imageUrl = media.source_url
      post.imageSource = 'featured'
      return media.source_url
    }
  }
  if (post.bodyImages.length) {
    post.imageUrl = post.bodyImages[0]
    post.imageSource = 'body'
    return post.bodyImages[0]
  }
  return null
}

/** يجلب أقسام الموقع (التصنيفات) مرتّبة تنازلياً حسب عدد المواضيع. */
export async function fetchCategories(): Promise<NewsCategory[]> {
  const data = await wpFetchJson(`${WP_BASE}/categories?per_page=100&orderby=count&order=desc&_fields=id,name,count`)
  if (!Array.isArray(data)) return []
  return (data as Array<{ id?: number; name?: string; count?: number }>)
    .filter(c => typeof c.id === 'number' && c.name)
    .map(c => ({ id: c.id as number, name: c.name as string, count: c.count ?? 0 }))
}

/** يجلب خبراً واحداً بمعرّفه (لإعادة توليد التصميم). */
export async function fetchPostById(id: number): Promise<NewsPost | null> {
  const data = await wpFetchJson(`${WP_BASE}/posts/${id}?_fields=${POST_FIELDS}`)
  if (!data || typeof data !== 'object') return null
  return normalizeLite(data as WPPostLite)
}

/** يجلب أحدث منشورات قسم معيّن (خفيف، بلا صور بعد). */
export async function fetchPostsByCategory(categoryId: number, perPage = 12): Promise<NewsPost[]> {
  const data = await wpFetchJson(
    `${WP_BASE}/posts?categories=${categoryId}&per_page=${perPage}&orderby=date&order=desc&_fields=${POST_FIELDS}`,
  )
  if (!Array.isArray(data)) return []
  return (data as WPPostLite[]).map(normalizeLite).filter((p): p is NewsPost => p !== null)
}

/**
 * يجلب أحدث المنشورات (خفيف، بلا صور بعد) — يُستخدم كاحتياطي.
 * يجلب الصفحات بالتوازي.
 */
export async function fetchCandidatePosts(opts: { perPage?: number; pages?: number } = {}): Promise<NewsPost[]> {
  const perPage = opts.perPage ?? 30
  const pages = opts.pages ?? 1
  const pageNums = Array.from({ length: pages }, (_, i) => i + 1)
  const results = await Promise.all(
    pageNums.map(page =>
      wpFetchJson(
        `${WP_BASE}/posts?per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=${POST_FIELDS}`,
      ),
    ),
  )
  const out: NewsPost[] = []
  for (const data of results) {
    if (!Array.isArray(data)) continue
    for (const p of data as WPPostLite[]) {
      const n = normalizeLite(p)
      if (n) out.push(n)
    }
  }
  return out
}
