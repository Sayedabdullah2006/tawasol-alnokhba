import { load } from 'cheerio'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request } from 'node:https'

export interface ArticleBlock { id: number; text: string; image?: string }
export interface ArticleSource { url: string; title: string; blocks: ArticleBlock[] }
export interface ImportedStory { title: string; content: string; images: string[]; sourceUrl: string }

export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)))
}

export async function publicArticleUrl(value: string) {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
    (url.port && !['80', '443'].includes(url.port))) throw new Error('أدخل رابط صفحة عامة صالحاً')
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  if (!addresses.length || addresses.some(item => !isPublicIPv4(item.address))) throw new Error('الرابط يجب أن يشير إلى موقع عام')
  url.hash = ''
  return { url, address: addresses[0].address }
}

// Pin the validated DNS address on every hop to prevent rebinding and private redirects.
export async function readArticleHtml(value: string, hops = 0): Promise<{ html: string; url: string }> {
  if (hops > 4) throw new Error('تحويلات كثيرة في رابط المصدر')
  const { url, address } = await publicArticleUrl(value)
  // Upgrade HTTP links; credentials/cookies are never forwarded to source websites.
  if (url.protocol === 'http:') { url.protocol = 'https:'; url.port = ''; return readArticleHtml(url.href, hops + 1) }
  const result = await new Promise<{ html?: string; redirect?: string }>((resolve, reject) => {
    const req = request(url, {
      family: 4,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; First1SaudiStudio/1.0)', Accept: 'text/html', 'Accept-Encoding': 'identity' },
    }, res => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume(); resolve({ redirect: new URL(res.headers.location, url).href }); return
      }
      if (res.statusCode !== 200 || !res.headers['content-type']?.includes('text/html')) {
        res.resume(); reject(new Error('تعذّر قراءة صفحة الخبر؛ يمكنك لصق النص يدوياً')); return
      }
      const chunks: Buffer[] = []; let bytes = 0
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > 3_000_000) { res.destroy(new Error('صفحة المصدر كبيرة جداً')); return }
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }))
    })
    const timer = setTimeout(() => req.destroy(new Error('انتهت مهلة قراءة الرابط')), 25_000)
    req.on('close', () => clearTimeout(timer))
    req.on('error', reject)
    req.end()
  })
  if (result.redirect) return readArticleHtml(result.redirect, hops + 1)
  return { html: result.html!, url: url.href }
}

export function extractArticle(html: string, url: string): ArticleSource {
  const $ = load(html)
  const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text().trim()
  $('script,style,nav,footer,header,aside,form,iframe,[hidden],.related,.related-articles,.related-content,.recommended,.advertisement,.social-share').remove()
  const selectors = ['[itemprop="articleBody"]', '.field--name-body', '.article-body', '.article-content', '.entry-content', 'article', 'main']
  let root = $('body')
  for (const selector of selectors) {
    const candidates = $(selector).toArray().sort((a, b) => $(b).text().length - $(a).text().length)
    if (candidates[0] && $(candidates[0]).text().trim().length > 180) { root = $(candidates[0]) as typeof root; break }
  }
  const blocks: ArticleBlock[] = []
  const seen = new Set<string>()
  root.find('h1,h2,h3,h4,p,li,img').each((_i, element) => {
    const el = $(element)
    if (element.tagName === 'img') {
      const src = el.attr('data-src') || el.attr('src')
      if (!src) return
      try {
        const image = new URL(src, url)
        if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password) return
        if (seen.has(image.href)) return
        seen.add(image.href)
        blocks.push({ id: blocks.length + 1, text: el.attr('alt')?.trim() || 'صورة في المقال', image: image.href })
      } catch { /* Invalid source images are omitted. */ }
      return
    }
    // Do not count nested paragraphs/list items twice, or "read also" link-only paragraphs.
    if (el.find('p,li').length) return
    const text = el.text().replace(/\s+/g, ' ').trim()
    if (!text || seen.has(text) || /^(اقرأ أيضاً|اقرأ أيضا|قد يعجبك|مواضيع ذات صلة)/.test(text)) return
    if (el.find('a').length && el.find('a').text().trim() === text) return
    seen.add(text); blocks.push({ id: blocks.length + 1, text })
  })
  const length = blocks.filter(b => !b.image).reduce((sum, b) => sum + b.text.length, 0)
  if (length < 180) throw new Error('لم يظهر نص خبر كافٍ في الصفحة؛ يمكنك لصقه يدوياً')
  if (length > 55_000 || blocks.length > 600) throw new Error('المقال طويل جداً؛ استورد رابطاً أكثر تحديداً أو الصق الخبر المطلوب')
  return { url, title, blocks }
}

// The model chooses source blocks, never rewrites factual body text or invents image URLs.
export function materializeStories(source: ArticleSource, value: unknown): ImportedStory[] {
  const input = value as { stories?: { title?: unknown; blockIds?: unknown }[] }
  if (!Array.isArray(input?.stories) || !input.stories.length || input.stories.length > 30) throw new Error('تعذّر فصل الأخبار من المصدر')
  const used = new Set<number>()
  return input.stories.map(story => {
    if (typeof story.title !== 'string' || !story.title.trim() || !Array.isArray(story.blockIds)) throw new Error('نتيجة تقسيم غير صالحة')
    const ids = new Set(story.blockIds)
    if (!ids.size || [...ids].some(id => typeof id !== 'number' || !source.blocks.some(b => b.id === id))) throw new Error('فقرات غير موجودة في المصدر')
    const blocks = source.blocks.filter(b => ids.has(b.id))
    for (const block of blocks.filter(b => !b.image)) {
      if (used.has(block.id)) throw new Error('تداخل في أخبار المصدر؛ أعد الاستيراد')
      used.add(block.id)
    }
    const content = blocks.filter(b => !b.image).map(b => b.text).join('\n\n')
    if (content.length < 60) throw new Error('أحد الأخبار لا يحتوي تفاصيل كافية للتصميم')
    return { title: story.title.trim().slice(0, 300), content, images: blocks.flatMap(b => b.image ? [b.image] : []), sourceUrl: source.url }
  })
}
