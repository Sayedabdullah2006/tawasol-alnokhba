/**
 * نشرة «النخبة في ٧» الأسبوعية — كرون كل جمعة 1:05م KSA (= 10:05 UTC).
 * يولّد البوستر (باتجاه الأسبوع) ثم ينشره تلقائياً عبر Post-Pulse لكل القنوات.
 * الحماية: CRON_API_KEY عبر header x-api-key أو ?key=
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { generateNewsletterPoster } from '@/lib/newsletter'
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
    // 1) توليد بوستر الأسبوع
    const { imageUrl, window, items, direction } = await generateNewsletterPoster()

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, label: window.label, direction, count: items.length, imageUrl })
    }

    // 2) رفع البوستر إلى Post-Pulse ثم النشر لكل القنوات المربوطة
    const caption = `🗞️ النخبة في ٧ — ${window.label}\nأبرز إنجازات الأسبوع.\n#أول_سعودي #First1Saudi`
    const media = await uploadMediaFromUrl(imageUrl)
    const { accountIds, scheduleId, result } = await publishNow({
      content: caption,
      attachmentPaths: media.path ? [media.path] : undefined,
    })

    // 3) تعليم النشرة كمنشورة + تسجيل المنشور
    const sc = await createServiceRoleClient()
    await sc.from('newsletters')
      .update({ published: true, published_at: new Date().toISOString() })
      .eq('image_url', imageUrl)
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

    return NextResponse.json({ success: true, label: window.label, direction, count: items.length, channels: accountIds.length })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
