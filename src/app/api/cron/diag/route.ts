// راوت تشخيص مؤقت — يفحص قدرة Vercel على الوصول إلى first1saudi.net.
// يُحذف بعد التشخيص.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

async function probe(label: string, url: string, headers: Record<string, string>) {
  const t0 = Date.now()
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(url, { headers, signal: ctrl.signal })
    clearTimeout(to)
    const txt = await r.text()
    return { label, ok: r.ok, status: r.status, ms: Date.now() - t0, len: txt.length, sample: txt.slice(0, 160) }
  } catch (e) {
    return { label, ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - t0 }
  }
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || request.headers.get('x-api-key')
  if (key !== KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const base = 'https://first1saudi.net/wp-json/wp/v2'
  const browserUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

  const results = await Promise.all([
    probe('no-ua-categories', `${base}/categories?per_page=5`, { Accept: 'application/json' }),
    probe('with-ua-categories', `${base}/categories?per_page=5`, { Accept: 'application/json', 'User-Agent': browserUA }),
    probe('no-ua-posts', `${base}/posts?_embed=1&per_page=2`, { Accept: 'application/json' }),
    probe('with-ua-posts', `${base}/posts?_embed=1&per_page=2`, { Accept: 'application/json', 'User-Agent': browserUA }),
  ])

  return NextResponse.json({ from: 'vercel', region: process.env.VERCEL_REGION ?? 'unknown', results })
}
