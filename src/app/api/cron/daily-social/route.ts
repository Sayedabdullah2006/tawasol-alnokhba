/**
 * المُنسّق اليومي لخطة النشر الاجتماعي.
 *
 * يومياً (عبر GitHub Actions أو أي خدمة cron):
 *   1. يجلب مرشّحين من أخبار first1saudi.net (التي تملك صورة بارزة).
 *   2. يستبعد ما نُشر خلال آخر N يوماً (تدوير الأرشيف بلا تكرار).
 *   3. يختار 3 أخبار منوّعة (تصنيفات مختلفة قدر الإمكان).
 *   4. يمرّر كل خبر في الاستوديو: تحليل → تغريدات → اتجاه → تصميم.
 *   5. يسجّل الدفعة في social_schedule (للتقويم ومنع التكرار).
 *   6. يرسل إيميلاً واحداً بالتصاميم الثلاثة + التغريدات إلى الإدارة.
 *
 * الحماية: مفتاح CRON_API_KEY عبر header x-api-key أو ?key= (نفس نمط daily-reminders).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { fetchCategories, fetchPostsByCategory, fetchCandidatePosts, resolveImageUrl, type NewsPost } from '@/lib/first1-news'
import { runStudioPipeline } from '@/lib/ai-studio'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'
const ADMIN_EMAIL = 'first1saudi@gmail.com'
// لا نعيد نشر نفس الخبر خلال هذه النافذة (أيام) — يضمن تدوير الأرشيف.
const DEDUP_WINDOW_DAYS = Number(process.env.SOCIAL_DEDUP_WINDOW_DAYS) || 30
const DEFAULT_COUNT = 3
// أقل عدد مواضيع ليُعتبر القسم مؤهلاً للتنويع.
const MIN_SECTION_POSTS = 10
// أقسام نستبعدها من التنويع (عامة/تشغيلية/فارغة).
const EXCLUDED_SECTIONS = new Set([
  'غير مصنف', 'Uncategorized', 'عام', 'الأخبار', 'الرصد الإعلامي', 'خزينة ناجحين',
  'قناة أول سعودى قريبا', 'جائزة أول سعودى قريبا', 'دورات تدريبية',
])

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  // ── المصادقة ──
  const authKey =
    request.headers.get('x-api-key') ||
    request.nextUrl.searchParams.get('key') ||
    request.headers.get('authorization')?.replace('Bearer ', '')
  if (authKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const count = Math.max(1, Math.min(5, Number(request.nextUrl.searchParams.get('count')) || DEFAULT_COUNT))
  const today = new Date().toISOString().slice(0, 10)

  try {
    const sc = await createServiceRoleClient()

    // ── 1) منع التكرار: الأخبار المنشورة خلال آخر N يوماً ──
    const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const { data: recent } = await sc
      .from('social_schedule')
      .select('wp_post_id')
      .gte('batch_date', since)
    const usedIds = new Set<number>((recent ?? []).map(r => Number(r.wp_post_id)))

    // ── 2) اختيار أقسام مختلفة فعلاً، وخبر واحد حديث غير مكرّر من كل قسم ──
    const sections = (await fetchCategories()).filter(
      c => c.count >= MIN_SECTION_POSTS && !EXCLUDED_SECTIONS.has(c.name),
    )
    const shuffledSections = [...sections].sort(() => Math.random() - 0.5)

    const selected: NewsPost[] = []
    let attempts = 0
    for (const sec of shuffledSections) {
      if (selected.length >= count) break
      if (attempts++ >= count * 4) break // حدّ أمان لزمن الجلب
      const posts = await fetchPostsByCategory(sec.id, 12)
      const fresh = posts.filter(p => !usedIds.has(p.id) && !selected.some(s => s.id === p.id))
      // نحلّ الصورة لأحدث القليل فقط، ونأخذ أول خبر تتوفر له صورة
      for (const cand of fresh.slice(0, 6)) {
        const img = await resolveImageUrl(cand)
        if (!img) continue
        cand.categoryNames = [sec.name] // علّمه بالقسم المختار (للتنويع/التقويم)
        selected.push(cand)
        break
      }
    }

    // ── 3) احتياطي: إن لم تكتمل (نفاد الأقسام/التكرار) نكمل من أحدث الأخبار ──
    if (selected.length < count) {
      const pool = await fetchCandidatePosts({ perPage: 40, pages: 1 })
      for (const p of pool) {
        if (selected.length >= count) break
        if (usedIds.has(p.id) || selected.some(s => s.id === p.id)) continue
        const img = await resolveImageUrl(p)
        if (!img) continue
        selected.push(p)
      }
    }

    if (selected.length === 0) {
      return NextResponse.json(
        { success: false, error: 'لا توجد أخبار صالحة (بصورة) من المصدر' },
        { status: 502 },
      )
    }

    // ── 4) تمرير كل خبر في الاستوديو (بالتوازي للبقاء ضمن حد المهلة) ──
    const settled = await Promise.allSettled(
      selected.map(post =>
        runStudioPipeline({ title: post.title, content: post.content, sourceImages: [post.imageUrl as string] })
          .then(studio => ({ post, tweets: studio.tweets, designUrl: studio.imageUrl, concept: studio.chosenConcept })),
      ),
    )
    const results: ProcessedItem[] = []
    const errors: { title: string; error: string }[] = []
    selected.forEach((post, i) => {
      const r = settled[i]
      if (r.status === 'fulfilled') results.push(r.value)
      else errors.push({ title: post.title, error: r.reason instanceof Error ? r.reason.message : 'خطأ غير معروف' })
    })

    if (results.length === 0) {
      return NextResponse.json(
        { success: false, error: 'فشل توليد كل التصاميم', errors },
        { status: 500 },
      )
    }

    // ── 5) تسجيل الدفعة في قاعدة البيانات ──
    const rows = results.map(r => ({
      wp_post_id: r.post.id,
      post_url: r.post.url,
      post_title: r.post.title,
      category: r.post.categoryNames[0] ?? null,
      source_image_url: r.post.imageUrl,
      design_image_url: r.designUrl,
      tweets: r.tweets,
      chosen_concept: r.concept,
      batch_date: today,
      status: 'suggested',
      email_sent: false,
    }))
    const { data: inserted } = await sc.from('social_schedule').insert(rows).select('id')
    const insertedIds = (inserted ?? []).map(r => r.id)

    // ── 6) إرسال الإيميل (تصاميم + تغريدات) ──
    const html = buildDigestEmail(results, today)
    const subject = `📌 خطة النشر اليومية — ${results.length} منشورات مقترحة (${today})`
    const emailOk = await sendEmail(ADMIN_EMAIL, subject, html)

    if (emailOk && insertedIds.length) {
      await sc.from('social_schedule').update({ email_sent: true }).in('id', insertedIds)
    }

    return NextResponse.json({
      success: true,
      date: today,
      generated: results.length,
      requested: count,
      emailSent: emailOk,
      failures: errors,
      posts: results.map(r => ({ title: r.post.title, url: r.post.url, design: r.designUrl })),
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'خطأ غير معروف' },
      { status: 500 },
    )
  }
}

// ─── أدوات ───────────────────────────────────────────────────────────────

interface ProcessedItem {
  post: NewsPost
  tweets: string
  designUrl: string
  concept: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** يبني الإيميل الموحّد (RTL عربي) بكل التصاميم والتغريدات. */
function buildDigestEmail(items: ProcessedItem[], date: string): string {
  const blocks = items
    .map((r, i) => {
      const tweetsHtml = escapeHtml(r.tweets).replace(/\n/g, '<br>')
      return `
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin:0 0 28px;background:#fff">
        <div style="background:#0A2D35;color:#FFD700;padding:12px 18px;font-weight:bold;font-size:16px">
          منشور ${i + 1} — ${escapeHtml(r.post.categoryNames[0] ?? 'منوّع')}
        </div>
        <div style="padding:18px">
          <a href="${escapeHtml(r.post.url)}" style="color:#0D3D47;font-size:18px;font-weight:bold;text-decoration:none">
            ${escapeHtml(r.post.title)}
          </a>
          <div style="margin:16px 0">
            <img src="${escapeHtml(r.designUrl)}" alt="التصميم" style="width:100%;max-width:480px;border-radius:10px;display:block" />
          </div>
          <div style="background:#f8fafc;border-radius:10px;padding:14px 16px;margin-top:8px">
            <div style="font-weight:bold;color:#2D8B3F;margin-bottom:8px">📝 التغريدات المقترحة:</div>
            <div style="color:#1e293b;font-size:15px;line-height:2">${tweetsHtml}</div>
          </div>
          <div style="margin-top:12px;font-size:13px;color:#64748b">
            🔗 <a href="${escapeHtml(r.post.url)}" style="color:#1A8B9F">الخبر الأصلي</a>
            &nbsp;|&nbsp;
            🖼️ <a href="${escapeHtml(r.designUrl)}" style="color:#1A8B9F">تحميل التصميم</a>
          </div>
        </div>
      </div>`
    })
    .join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#0A2D35;font-size:22px;margin:0">خطة النشر اليومية — First1Saudi</h1>
      <p style="color:#64748b;font-size:14px;margin:6px 0 0">${date} · ${items.length} منشورات جاهزة للنشر</p>
    </div>
    ${blocks}
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:8px">
      رسالة آلية من نظام خطة النشر. راجع المحتوى وانشره يدوياً على حساب First1Saudi.
    </p>
  </div>
</body>
</html>`
}
