/**
 * محلّل RSS عام + فلتر «إنجازات السعوديين» — مصادر إضافية لخطة النشر اليومية.
 * يعتمد على RSS موثوق (لا يعتمد على بنية موقع معيّنة)، ويُبقي فقط أخبار الإنجاز/الأولية
 * للسعوديين (أوائل/اختراعات/جوائز/مسابقات عالمية…) مع صورة.
 */
import { htmlToPlainText, type NewsPost } from './first1-news'
import { isSocialNewsEligible } from './social-news-selection'

export interface RssSource { key: string; label: string; url: string }

// مصادر RSS موثوقة (مؤكَّدة فعّالة). يمكن إضافة المزيد لاحقاً.
export const RSS_SOURCES: RssSource[] = [
  { key: 'alarabiya', label: 'العربية', url: 'https://www.alarabiya.net/feed/rss2/ar/saudi-today.xml' },
]

// كلمات الإنجاز/الأولية + إلزام ذكر السعودية لتصفية أخبار السعوديين المميّزة.
const ACHIEVEMENT = [
  'أول', 'أوائل', 'الأول', 'الأولى', 'إنجاز', 'إنجازات', 'اختراع', 'اخترع', 'براءة',
  'جائزة', 'جوائز', 'تتويج', 'توّج', 'يتوّج', 'حصد', 'حصدت', 'يحصد', 'ميدالية',
  'مسابقة', 'بطولة', 'فاز', 'فازت', 'يفوز', 'فوز', 'تكريم', 'كُرّم', 'يُكرّم',
  'يحقق', 'حقّق', 'حققت', 'عالمي', 'عالمية', 'دولي', 'دولية', 'وسام',
]
const SAUDI = ['سعودي', 'سعودية', 'السعودية', 'سعوديون', 'سعوديات']

function isAchievement(text: string): boolean {
  return SAUDI.some(s => text.includes(s)) && ACHIEVEMENT.some(k => text.includes(k))
}

function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function tagText(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : null
}
function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim()
}

function extractImage(block: string): string | null {
  let m = block.match(/<media:content[^>]+url="([^"]+)"/i); if (m) return m[1]
  m = block.match(/<media:thumbnail[^>]+url="([^"]+)"/i); if (m) return m[1]
  m = block.match(/<enclosure[^>]+url="([^"]+)"/i); if (m) return m[1]
  m = block.match(/https?:\/\/[^"'<> ]+\.(?:jpg|jpeg|png|webp)/i); if (m) return m[0]
  return null
}

/** يجلب مرشّحي خبر من مصدر RSS، مفلترين على إنجازات السعوديين، مع صورة. */
export async function fetchRssCandidates(src: RssSource): Promise<NewsPost[]> {
  let xml = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml,application/xml,text/xml,*/*' },
      })
      if (r.ok) { xml = await r.text(); break }
    } catch { /* إعادة محاولة */ }
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)))
  }
  if (!xml) return []

  const blocks = xml.split(/<item[\s>]/i).slice(1).map(s => {
    const end = s.indexOf('</item>')
    return end >= 0 ? s.slice(0, end) : s
  })

  const out: NewsPost[] = []
  for (const block of blocks) {
    const link = (tagText(block, 'link') || '').trim()
    const title = stripCdata(tagText(block, 'title') || '').replace(/\s+/g, ' ').trim()
    const descRaw = tagText(block, 'content:encoded') || tagText(block, 'description') || ''
    const content = htmlToPlainText(stripCdata(descRaw)).trim()
    const img = extractImage(block)
    const pub = (tagText(block, 'pubDate') || '').trim()
    if (!title || !link || !img) continue
    if (!isAchievement(`${title} ${content}`) || !isSocialNewsEligible(title, content)) continue
    out.push({
      id: hashId(link),
      url: link,
      title,
      content: content || title,
      categoryIds: [],
      categoryNames: [src.label],
      publishedAt: pub,
      featuredMediaId: 0,
      bodyImages: [],
      imageUrl: img,
      imageSource: 'featured',
    })
  }
  return out
}
