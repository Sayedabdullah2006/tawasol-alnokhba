/**
 * نشرة «النخبة في ٧» الأسبوعية — كرون كل جمعة 1:05م KSA (= 10:05 UTC).
 * يولّد البوستر (باتجاه الأسبوع) ثم ينشره تلقائياً عبر Post-Pulse لكل القنوات.
 * الحماية: CRON_API_KEY عبر header x-api-key أو ?key=
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateNewsletterPoster, getWeeklyWindow } from '@/lib/newsletter'
import { uploadMediaFromUrl, publishNow } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

async function handle(request: NextRequest) {
  const authKey =
    request.headers.get('x-api-key') ||
    request.nextUrl.searchParams.get('key') ||
    request.headers.get('authorization')?.replace('Bearer ', '')
  if (authKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // وضع تجربة آمن: يولّد المعاينة دون نشر (?dryRun=1 أو ?publish=0)
  const dryRun =
    request.nextUrl.searchParams.get('dryRun') === '1' ||
    request.nextUrl.searchParams.get('publish') === '0'

  try {
    const sc = await createServiceRoleClient()
    const window = getWeeklyWindow()

    // إن وُجدت نشرة معتمدة/منشورة لهذا الأسبوع فهي مجدولة أصلاً في Post-Pulse (عبر الاعتماد)
    // — نتخطّى تماماً لتجنّب ازدواج النشر. الكرون يتدخّل فقط حين لا توجد نشرة.
    const { data: existing } = await sc
      .from('newsletters')
      .select('id, status, scheduled_for')
      .in('status', ['scheduled', 'published'])
      .gte('scheduled_for', new Date(new Date(window.endUtc).getTime() - 3600 * 1000).toISOString())
      .lte('scheduled_for', new Date(new Date(window.endUtc).getTime() + 3600 * 1000).toISOString())
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: true, skipped: true, reason: 'النشرة معتمدة/مجدولة مسبقاً لهذا الأسبوع' })
    }

    // لا توجد نشرة معتمدة: ولّد ونشر تلقائياً على X فقط
    const gen = await generateNewsletterPoster()
    const imageUrl = gen.imageUrl
    const caption = gen.caption
    const label = gen.window.label
    const newsletterId = gen.id

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, label, imageUrl, caption })
    }

    // رفع البوستر إلى Post-Pulse ثم النشر على X فقط
    const media = await uploadMediaFromUrl(imageUrl)
    const { accountIds, scheduleId, result } = await publishNow({
      content: caption,
      attachmentPaths: media.path ? [media.path] : undefined,
      platforms: ['X_TWITTER'],
    })

    // تعليم النشرة كمنشورة + تسجيل المنشور
    if (newsletterId) {
      await sc.from('newsletters')
        .update({ published: true, status: 'published', published_at: new Date().toISOString() })
        .eq('id', newsletterId)
    }
    try {
      await sc.from('postpulse_posts').insert({
        schedule_id: scheduleId,
        content: caption,
        design_url: imageUrl,
        accounts: accountIds,
        status: 'published',
        scheduled_for: new Date().toISOString(),
        event_raw: result as object,
      })
    } catch { /* تجاهل */ }

    return NextResponse.json({ success: true, label, channels: accountIds.length })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
