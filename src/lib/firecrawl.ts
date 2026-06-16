/**
 * مساعد Firecrawl — يُستخدم لكشط صفحات محمية بـ Cloudflare (manhom.com)
 * عبر واجهة Firecrawl الرسمية (متصفح حقيقي يتجاوز الحماية).
 *
 * يقرأ المفتاح من process.env.FIRECRAWL_API_KEY فقط. يُستخدم لمرة واحدة عند
 * إثراء قائمة "السعوديات الأوائل" (لا في التشغيل اليومي).
 */
const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'

export interface ProfileExtract {
  bio?: string
  achievements?: string[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    bio: { type: 'string' },
    achievements: { type: 'array', items: { type: 'string' } },
  },
}

const PROMPT =
  'هذه صفحة تعريف بسيدة سعودية رائدة. استخرج: bio = نبذة من جملة إلى ثلاث جمل بالعربية تلخّص من هي ودورها، ' +
  'و achievements = قائمة بأبرز إنجازاتها/جوائزها/كونها "أول"/أرقامها اللافتة بالعربية (إن وُجدت، وإلا اتركها فارغة). ' +
  'التزم بما هو مذكور في الصفحة فقط دون اختلاق.'

/** يكشط صفحة سيدة ويُعيد السيرة + الإنجازات، أو null عند الفشل. */
export async function scrapeProfile(url: string): Promise<ProfileExtract | null> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) throw new Error('FIRECRAWL_API_KEY غير مهيّأ — أضِفه في إعدادات الخادم')

  const resp = await fetch(FIRECRAWL_SCRAPE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      proxy: 'auto',
      onlyMainContent: true,
      waitFor: 3000,
      formats: [{ type: 'json', prompt: PROMPT, schema: SCHEMA }],
    }),
  })
  if (!resp.ok) return null

  const json = (await resp.json()) as { data?: { json?: ProfileExtract } }
  const data = json?.data?.json
  if (!data) return null
  return {
    bio: typeof data.bio === 'string' ? data.bio : undefined,
    achievements: Array.isArray(data.achievements)
      ? data.achievements.filter((a): a is string => typeof a === 'string' && !!a.trim())
      : [],
  }
}
