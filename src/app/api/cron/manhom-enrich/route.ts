/**
 * إثراء قائمة "السعوديات الأوائل" بالسيرة والإنجازات — عملية لمرة واحدة.
 *
 * يكشط صفحة كل سيدة (غير المُثراة بعد) عبر Firecrawl ويخزّن bio + achievements.
 * محمي بـ CRON_API_KEY. يعالج دفعة (limit) في كل استدعاء ويُبلغ بالمتبقّي،
 * فيمكن استدعاؤه عدة مرات حتى يكتمل (remaining = 0).
 *
 * يتطلّب FIRECRAWL_API_KEY في بيئة الخادم.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { scrapeProfile } from '@/lib/firecrawl'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const key =
    request.headers.get('x-api-key') ||
    request.nextUrl.searchParams.get('key') ||
    request.headers.get('authorization')?.replace('Bearer ', '')
  if (key !== CRON_API_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.FIRECRAWL_API_KEY) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY غير مهيّأ في الخادم' }, { status: 500 })
  }

  const limit = Math.max(1, Math.min(40, Number(request.nextUrl.searchParams.get('limit')) || 25))

  try {
    const sc = await createServiceRoleClient()
    const { data: people } = await sc
      .from('manhom_people')
      .select('id, name, profile_url')
      .eq('is_active', true)
      .is('bio', null)
      .not('profile_url', 'is', null)
      .limit(limit)

    let enriched = 0
    let failed = 0
    const failures: string[] = []

    for (const p of people ?? []) {
      try {
        const res = await scrapeProfile(p.profile_url as string)
        if (res && (res.bio || (res.achievements && res.achievements.length))) {
          await sc
            .from('manhom_people')
            .update({
              bio: res.bio ?? null,
              achievements: res.achievements && res.achievements.length ? res.achievements : null,
              enriched_at: new Date().toISOString(),
            })
            .eq('id', p.id)
          enriched++
        } else {
          failed++
          failures.push(p.name as string)
        }
      } catch {
        failed++
        failures.push(p.name as string)
      }
      await sleep(500) // تلطيف على Firecrawl
    }

    const { count: remaining } = await sc
      .from('manhom_people')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('bio', null)

    return NextResponse.json({
      success: true,
      processed: (people ?? []).length,
      enriched,
      failed,
      remaining: remaining ?? 0,
      failures,
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}
