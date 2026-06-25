/**
 * مصدر «سعوديبيديا» (saudipedia.com) لخطة النشر اليومية.
 *
 * سعوديبيديا موسوعة وطنية دائمة الخضرة (لا تملك RSS)، فنتعامل معها كمصدر تدويري
 * مثل manhom: نختار إنجازات/أوائل السعوديين (رياضة/اختراعات/جوائز/مسابقات عالمية)
 * ونمنع التكرار عبر نافذة الأيام في المُنسّق اليومي.
 *
 * آليتان مكمّلتان (كلاهما يعتمد صفحات مُخدَّمة من الخادم — fetch + regex، بلا اعتماد على JS):
 *   1) قائمة منسَّقة لمقالات إنجازات مؤكَّدة — تُجلب وسوم og منها (عنوان/صورة/وصف).
 *   2) حمولة /api/search المنسَّقة (تتغيّر مع تحديث الموقع) — مفلترة على كلمات الإنجاز.
 * أي رابط متعذّر أو بلا صورة يُتخطّى بهدوء (لا يُفشل المصدر).
 */
import { htmlToPlainText, type NewsPost } from './first1-news'

const BASE = 'https://saudipedia.com'
const UA = 'Mozilla/5.0 (compatible; NukhbaBot/1.0; +https://nukhba.media)'
export const SAUDIPEDIA_LABEL = 'سعوديبيديا'

// قائمة منسَّقة لمقالات إنجازات/أوائل السعوديين (متنوّعة: أولمبياد/آسيوية/اختراعات/جوائز/أرقام قياسية/فضاء).
// روابط حقيقية مؤكَّدة من فهرس الموقع. تُجلب وسوم og لكل صفحة عند التشغيل.
const SEED_SLUGS = [
  'هادي-صوعان',                                   // أول سعودي يحصل على ميدالية أولمبية (فضية سيدني)
  'طارق-حامدي',                                   // فضية الكاراتيه — أولمبياد طوكيو
  'قائمة-الميداليات-السعودية-في-الأولمبياد',      // ميداليات السعودية الأولمبية
  'السعودية-في-الألعاب-الآسيوية',                 // إنجازات آسيوية (أول ذهبية…)
  'براءات-الاختراع-في-السعودية',                  // اختراعات/براءات
  'قائمة-سعوديين-حازوا-جائزة-البوكر',             // جائزة عالمية (الرواية العربية)
  'الاتحاد-السعودي-للمنطاد',                       // رقم قياسي عالمي (غينيس)
  'من-أول-رائد-فضاء-عربي؟',                        // أول رائد فضاء عربي مسلم
]

// كلمات الإنجاز/الأولية — للفلترة (سعوديبيديا كلها عن السعودية، فلا نشترط ذكر «سعودي»).
const ACHIEVEMENT = [
  'أول', 'أوائل', 'الأول', 'الأولى', 'إنجاز', 'إنجازات', 'اختراع', 'اخترع', 'مخترع', 'براءة', 'براءات',
  'جائزة', 'جوائز', 'تتويج', 'توّج', 'حصد', 'حصدت', 'ميدالية', 'ميداليات', 'بطل', 'بطلة', 'بطولة',
  'فاز', 'فازت', 'فوز', 'تكريم', 'حقّق', 'حققت', 'يحقق', 'عالمي', 'عالمية', 'دولي', 'دولية',
  'وسام', 'رقم قياسي', 'قياسي', 'غينيس', 'جينيس', 'أولمبي', 'أولمبية', 'نوبل',
]

function isAchievement(text: string): boolean {
  return ACHIEVEMENT.some(k => text.includes(k))
}

function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── استخراج وسوم og من HTML مُخدَّم (ترتيب السمات غير مضمون) ──
function metaContent(html: string, key: string): string | null {
  // يطابق <meta ... property|name="key" ... content="..."> بأي ترتيب للسمتين
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=["']([^"']*)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${key}["']`, 'i')
  const m = html.match(re1) || html.match(re2)
  return m ? m[1] : null
}

/** يجلب صفحة سعوديبيديا ويستخرج عنوان/صورة/وصف og. يعيد null إن تعذّر أو بلا صورة. */
async function fetchSeedArticle(slug: string): Promise<NewsPost | null> {
  const url = `${BASE}/${encodeURI(slug)}`
  let html = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 20000)
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: ctrl.signal })
      clearTimeout(to)
      if (r.ok) { html = await r.text(); break }
    } catch { /* إعادة محاولة */ }
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)))
  }
  if (!html) return null

  const title = htmlToPlainText(metaContent(html, 'og:title') || '').trim()
  const image = (metaContent(html, 'og:image') || '').trim()
  const desc = htmlToPlainText(metaContent(html, 'og:description') || '').trim()
  if (!title || !image) return null

  return {
    id: hashId(slug),
    url,
    title,
    content: desc || title,
    categoryIds: [],
    categoryNames: [SAUDIPEDIA_LABEL],
    publishedAt: '',
    featuredMediaId: 0,
    bodyImages: [],
    imageUrl: image,
    imageSource: 'featured',
  }
}

// ── الآلية الثانية: حمولة /api/search المنسَّقة (عناصر بعناوين/صور/وصف جاهزة) ──
interface SearchItem { id?: number; link?: string | null; title?: string; lead?: string; image?: { src?: string } }

function itemToPost(it: SearchItem): NewsPost | null {
  const link = (it.link || '').trim()
  const title = (it.title || '').trim()
  const img = (it.image?.src || '').trim()
  if (!link || !title || !img) return null
  const lead = htmlToPlainText(it.lead || '').trim()
  if (!isAchievement(`${title} ${lead}`)) return null
  // الروابط في الحمولة مُرمَّزة جزئياً (%22…)؛ نفكّ ثم نعيد الترميز لرابط نظيف.
  let path = link
  try { path = decodeURIComponent(link) } catch { /* أبقِه كما هو */ }
  return {
    id: typeof it.id === 'number' ? it.id : hashId(link),
    url: `${BASE}${encodeURI(path)}`,
    title: htmlToPlainText(title),
    content: lead || title,
    categoryIds: [],
    categoryNames: [SAUDIPEDIA_LABEL],
    publishedAt: '',
    featuredMediaId: 0,
    bodyImages: [],
    imageUrl: img,
    imageSource: 'featured',
  }
}

async function fetchSearchPayload(): Promise<NewsPost[]> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(`${BASE}/api/search`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal,
    })
    clearTimeout(to)
    if (!r.ok) return []
    const data = await r.json() as Record<string, { items?: SearchItem[] }>
    const out: NewsPost[] = []
    // الأقسام الغنية بالمحتوى القابل للنشر (لها روابط ووصف)
    for (const sec of ['article', 'personalities', 'questionsAndAnswers', 'lists']) {
      for (const it of data[sec]?.items ?? []) {
        const p = itemToPost(it)
        if (p) out.push(p)
      }
    }
    return out
  } catch { return [] }
}

/**
 * يجمع مرشّحي إنجازات من سعوديبيديا (قائمة منسَّقة + حمولة البحث) مع إزالة التكرار بالمعرّف.
 * كل عنصر يحمل صورة جاهزة في imageUrl. يُستهلك في المُنسّق اليومي كمصدر تدويري.
 */
export async function fetchSaudipediaCandidates(): Promise<NewsPost[]> {
  const [seedResults, searchResults] = await Promise.all([
    Promise.allSettled(SEED_SLUGS.map(fetchSeedArticle)),
    fetchSearchPayload(),
  ])
  const seeds: NewsPost[] = []
  for (const r of seedResults) if (r.status === 'fulfilled' && r.value) seeds.push(r.value)

  const byId = new Map<number, NewsPost>()
  for (const p of [...seeds, ...searchResults]) {
    if (!byId.has(p.id)) byId.set(p.id, p)
  }
  return [...byId.values()]
}
