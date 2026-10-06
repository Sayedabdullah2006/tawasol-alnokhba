import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { splitArticleStories } from '@/lib/studio-link-import'
import { extractArticle, publicArticleUrl, readArticleHtml } from '@/lib/studio-link-source'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  let value: unknown
  try { value = (await req.json()).url } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }) }
  if (typeof value !== 'string' || value.length > 3000) return NextResponse.json({ error: 'أدخل رابط الخبر' }, { status: 400 })
  try {
    const { url } = await publicArticleUrl(value.trim())
    let source
    try {
      const result = await readArticleHtml(url.href)
      source = extractArticle(result.html, result.url)
    } catch (error) {
      const key = process.env.FIRECRAWL_API_KEY
      if (!key) throw error
      const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.href, onlyMainContent: true, formats: ['html'], proxy: 'auto' }),
        signal: AbortSignal.timeout(60_000),
      })
      const data = await response.json()
      if (!response.ok || typeof data?.data?.html !== 'string') throw error
      source = extractArticle(data.data.html, url.href)
    }
    const stories = await splitArticleStories(source)
    return NextResponse.json({ stories, sourceTitle: source.title, sourceUrl: source.url }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[studio/import-link]', error instanceof Error ? error.message : 'Import failed')
    return NextResponse.json({ error: error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر استيراد الرابط؛ جرّب رابط المقال المباشر أو الصق النص يدوياً' }, { status: 422 })
  }
}
