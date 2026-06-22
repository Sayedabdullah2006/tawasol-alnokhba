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

    // 1) استخدم النشرة المعتمدة المجدولة لهذا الأسبوع إن وُجدت، وإلا ولّد تلقائياً
    let imageUrl: string
    let caption: string
    let label = window.label
    let newsletterId: string | null = null

    const { data: scheduled } = await sc
      .from('newsletters')
      .select('id, image_url, caption, label, scheduled_for, status')
      .eq('status', 'scheduled')
      .gte('scheduled_for', new Date(new Date(window.endUtc).getTime() - 3600 * 1000).toISOString())
      .lte('scheduled_for', new Date(new Date(window.endUtc).getTime() + 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (scheduled) {
      imageUrl = scheduled.image_url
      caption = scheduled.caption || `النخبة في ٧ — ${scheduled.label}`
      label = scheduled.label
      newsletterId = scheduled.id
    } else {
      const gen = await generateNewsletterPoster()
      imageUrl = gen.imageUrl
      caption = gen.caption
      label = gen.window.label
      newsletterId = gen.id
    }

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, label, imageUrl, caption, usedScheduled: !!scheduled })
    }

    // 2) رفع البوستر إلى Post-Pulse ثم النشر لكل القنوات المربوطة
    const media = await uploadMediaFromUrl(imageUrl)
    const { accountIds, scheduleId, result } = await publishNow({
      content: caption,
      attachmentPaths: media.path ? [media.path] : undefined,
    })

    // 3) تعليم النشرة كمنشورة + تسجيل المنشور
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
        event_raw: result as object,
      })
    } catch { /* تجاهل */ }

    return NextResponse.json({ success: true, label, channels: accountIds.length, usedScheduled: !!scheduled })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
