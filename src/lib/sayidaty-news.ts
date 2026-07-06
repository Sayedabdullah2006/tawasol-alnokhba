/**
 * مصدر «سيدتي» (sayidaty.net) — صفحات وسم مخصّصة لقصص السعوديات (رائدات/المرأة
 * السعودية). الموقع لا يملك RSS لهذه الصفحات، فنحلّل صفحة القائمة (HTML) لاستخراج
 * المرشّحين (عنوان + صورة + رابط)، ثم نُثري كل مرشّح بوصف og:description من صفحة
 * المقال نفسها (صفحة القائمة لا توفّر نصاً كافياً للتحليل).
 *
 * محتوى مُنسَّق أصلاً حول إنجازات/قصص السعوديات — لا حاجة لفلتر كلمات إضافي
 * (مثل manhom)، فالمصدر (صفحة الوسم) هو الفلتر نفسه.
 */
import { htmlToPlainText, type NewsPost } from './first1-news'

const UA = 'Mozilla/5.0 (compatible; NukhbaBot/1.0; +https://nukhba.media)'
const MAX_ENRICH = 8 // سقف عدد المقالات المُثراة بالوصف لكل مصدر (ضبط التكلفة)

export interface SayidatySource { key: string; label: string; url: string }

// صفحات وسم تتناول قصص/إنجازات السعوديات — تُضاف حسب الحاجة.
export const SAYIDATY_SOURCES: SayidatySource[] = [
  { key: 'sayidaty_raedat', label: 'سيدتي - رائدات سعوديات', url: 'https://www.sayidaty.net/category/tags/%D8%B1%D8%A7%D8%A6%D8%AF%D8%A7%D8%AA-%D8%B3%D8%B9%D9%88%D8%AF%D9%8A%D8%A7%D8%AA' },
  { key: 'sayidaty_almaraa', label: 'سيدتي - المرأة السعودية', url: 'https://www.sayidaty.net/category/tags/%D8%A7%D9%84%D9%85%D8%B1%D8%A3%D8%A9-%D8%A7%D9%84%D8%B3%D8%B9%D9%88%D8%AF%D9%8A%D8%A9' },
]

function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// استخراج وسوم og/meta من HTML مُخدَّم (ترتيب السمات غير مضمون).
function metaContent(html: string, key: string): string | null {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=["']([^"']*)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${key}["']`, 'i')
  const m = html.match(re1) || html.match(re2)
  return m ? m[1] : null
}

async function fetchHtml(url: string, timeoutMs = 20000): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), timeoutMs)
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: ctrl.signal })
      clearTimeout(to)
      if (r.ok) return await r.text()
    } catch { /* إعادة محاولة */ }
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)))
  }
  return ''
}

interface Candidate { id: number; url: string; title: string; imageUrl: string; category: string }

/**
 * يحلّل صفحة قائمة الوسم ويستخرج المرشّحين (عنوان/صورة/رابط/قسم) — بلا محتوى بعد.
 * يقسّم HTML عند كل بطاقة (`cell mode-teaser`)؛ أول تطابق لكل حقل ضمن الجزء
 * المتبقي يخصّ البطاقة الحالية دائماً (يسبق بطاقة الوسم التالية في الترتيب).
 */
function parseListing(html: string): Candidate[] {
  const blocks = html.split('<div class="cell mode-teaser"').slice(1)
  const out: Candidate[] = []
  for (const block of blocks) {
    const hrefM = block.match(/href="([^"]+)"/)
    const imgM = block.match(/<img[^>]+src="([^"]+)"/)
    const titleM = block.match(/field--name-title[^>]*>([^<]*)</)
    const catM = block.match(/field--name-field-section[^>]*><a[^>]*>([^<]+)</)
    const url = hrefM?.[1]?.trim()
    const title = htmlToPlainText(titleM?.[1] || '').trim()
    const imageUrl = imgM?.[1]?.trim()
    if (!url || !title || !imageUrl) continue
    out.push({ id: hashId(url), url, title, imageUrl, category: htmlToPlainText(catM?.[1] || '').trim() })
  }
  return out
}

/** يُثري مرشّحاً واحداً بوصف og:description (+صورة أعلى دقّة إن توفّرت) من صفحة المقال. */
async function enrichCandidate(c: Candidate): Promise<NewsPost> {
  const html = await fetchHtml(c.url)
  const desc = html ? htmlToPlainText(metaContent(html, 'og:description') || '').trim() : ''
  const ogImage = html ? (metaContent(html, 'og:image') || '').trim() : ''
  return {
    id: c.id,
    url: c.url,
    title: c.title,
    content: desc || c.title, // عند تعذّر الإثراء نستخدم العنوان كمحتوى احتياطي
    categoryIds: [],
    categoryNames: c.category ? [c.category] : [],
    publishedAt: '',
    featuredMediaId: 0,
    bodyImages: [],
    imageUrl: ogImage || c.imageUrl,
    imageSource: 'featured',
  }
}

/** يجلب مرشّحي خبر من صفحة وسم في سيدتي، مع إثراء المحتوى من صفحة كل مقال. */
export async function fetchSayidatyCandidates(src: SayidatySource): Promise<NewsPost[]> {
  const listingHtml = await fetchHtml(src.url)
  if (!listingHtml) return []
  const candidates = parseListing(listingHtml).slice(0, MAX_ENRICH)
  const settled = await Promise.allSettled(candidates.map(enrichCandidate))
  const out: NewsPost[] = []
  for (const r of settled) if (r.status === 'fulfilled') out.push(r.value)
  return out
}
