/**
 * المُنسّق اليومي لخطة النشر الاجتماعي.
 *
 * يومياً (عبر GitHub Actions أو أي خدمة cron):
 *   1. يجلب مرشّحين من first1saudi.net + مصادر RSS + سعوديبيديا + سيدتي + manhom.
 *   2. يستبعد ما نُشر خلال آخر N يوماً لكل مصدر على حدة (تدوير الأرشيف بلا تكرار).
 *   3. يختار DEFAULT_COUNT أخبار منوّعة (مصادر/تصنيفات مختلفة قدر الإمكان).
 *   4. يمرّر كل خبر في الاستوديو: تحليل → تغريدات → اتجاه → تصميم.
 *   5. يسجّل الدفعة في social_schedule (للتقويم ومنع التكرار).
 *   6. يرسل إيميلاً واحداً بالتصاميم الثلاثة + التغريدات إلى الإدارة.
 *
 * الحماية: مفتاح CRON_API_KEY عبر header x-api-key أو ?key= (نفس نمط daily-reminders).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { fetchCategories, fetchPostsByCategory, resolveImageUrl, type NewsPost } from '@/lib/first1-news'
import { fetchManhomCandidates, ensureColorImage, MANHOM_NOTE } from '@/lib/manhom-news'
import { fetchRssCandidates, RSS_SOURCES } from '@/lib/rss-news'
import { fetchSaudipediaCandidates } from '@/lib/saudipedia-news'
import { fetchSayidatyCandidates, SAYIDATY_SOURCES } from '@/lib/sayidaty-news'
import { getFirst1XArchiveCandidates } from '@/lib/first1-x-archive'
import { runStudioPipeline, shuffledPosterStyles } from '@/lib/ai-studio'
import { classifySection } from '@/lib/showcase-sections'
import { sendEmail } from '@/lib/email'
import { isSocialNewsEligible } from '@/lib/social-news-selection'

// المصدر: 'first1saudi' | 'manhom' | مفتاح مصدر RSS (مثل 'alarabiya')
type SourceKind = string
interface SelectedItem { post: NewsPost; source: SourceKind }

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'
const ADMIN_EMAIL = 'first1saudi@gmail.com'
// لا نعيد نشر نفس الخبر خلال هذه النافذة (أيام) — يضمن تدوير الأرشيف.
const DEDUP_WINDOW_DAYS = Number(process.env.SOCIAL_DEDUP_WINDOW_DAYS) || 30
const ENTITY_DEDUP_WINDOW_DAYS = Number(process.env.SOCIAL_ENTITY_DEDUP_WINDOW_DAYS) || 180
const DEFAULT_COUNT = 5
// The archive search keeps daily generation from being limited to the newest posts.
const FIRST1_ARCHIVE_SECTIONS = 4
const FIRST1_ARCHIVE_PAGES = 3
const FIRST1_ARCHIVE_PER_PAGE = 12
// أقل عدد مواضيع ليُعتبر القسم مؤهلاً للتنويع.
const MIN_SECTION_POSTS = 10
// أقسام نستبعدها من التنويع (عامة/تشغيلية/فارغة).
const EXCLUDED_SECTIONS = new Set([
  'غير مصنف', 'Uncategorized', 'عام', 'الأخبار', 'الرصد الإعلامي', 'خزينة ناجحين',
  'قناة أول سعودى قريبا', 'جائزة أول سعودى قريبا', 'دورات تدريبية',
])

const SUBJECT_STOP_WORDS = new Set([
  'السعودي', 'السعودية', 'بالمملكة', 'المملكة', 'المملكه', 'سعودي', 'سعوديه', 'اول', 'اولي', 'اولى',
  'يحقق', 'تحقق', 'يحققون', 'تفوز', 'يفوز', 'فاز', 'تفوق', 'نجاح', 'انجاز', 'انجازات', 'جائزة', 'جايزه', 'جوائز',
  'ضمن', 'في', 'من', 'الى', 'على', 'عن', 'مع', 'بعد', 'قبل', 'هذا', 'هذه', 'ذلك', 'تعلن', 'اعلان', 'بن', 'بنت',
  'الامير', 'الدكتور', 'دكتور', 'الدكتورة', 'الدكتوره', 'دكتورة', 'دكتوره', 'المهندس', 'مهندس', 'المهندسة', 'المهندسه', 'مهندسة', 'مهندسه',
])

function subjectFingerprint(value: string | null | undefined): string[] {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  return [...new Set(normalized.split(/\s+/).filter(token => token.length >= 3 && !SUBJECT_STOP_WORDS.has(token)))]
}

function isRepeatedSubject(candidate: string[], seen: string[][]): boolean {
  if (!candidate.length) return false
  return seen.some(previous => {
    if (!previous.length) return false
    const previousTokens = new Set(previous)
    const shared = candidate.filter(token => previousTokens.has(token)).length
    return shared >= 2 || (candidate.length === 1 && previous.length === 1 && shared === 1)
  })
}

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
  const force = request.nextUrl.searchParams.get('force') === '1'
  const sourceParam = request.nextUrl.searchParams.get('source')
  return runBatch({ count, force, sourceParam })
}

/**
 * توليد دفعة منشورات ليوم. تُستدعى من الكرون ومن زر «توليد يدوي» في لوحة الإدارة.
 * كل استدعاء يُولّد count منشوراً جديداً بغضّ النظر عمّا وُلّد يدوياً اليوم — الحماية
 * الوحيدة هي منع تكرار نفس الخبر لكل مصدر (DEDUP_WINDOW_DAYS)، لا حدّ إجمالي لليوم.
 */
export async function runBatch(
  { count, force, sourceParam }: { count: number; force: boolean; sourceParam: string | null },
): Promise<NextResponse> {
  const today = new Date().toISOString().slice(0, 10)

  try {
    const sc = await createServiceRoleClient()

    // ── 0) توليد الكرون اليومي غير مشروط بعدد ما وُلّد يدوياً اليوم. ──
    // زر «توليد يدوي» منفصل تماماً ولا يُقلّل حصة الكرون: يُولَّد العدد المطلوب
    // (count) كاملاً في كل استدعاء، والحماية الوحيدة من التكرار هي عدم إعادة نفس
    // الأخبار (منع التكرار لكل مصدر خلال DEDUP_WINDOW_DAYS في الخطوة التالية).

    // ── 1) منع التكرار (لكل مصدر على حدة) خلال آخر N يوماً ──
    const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const entitySince = new Date(Date.now() - ENTITY_DEDUP_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const { data: recent } = await sc
      .from('social_schedule')
      .select('wp_post_id, source, post_url, post_title, batch_date')
      .gte('batch_date', entitySince)
    // منع التكرار لكل مصدر على حدة (المفتاح = اسم المصدر)
    const usedByKey = new Map<string, Set<number>>()
    for (const r of recent ?? []) {
      if (String(r.batch_date) < since) continue
      const k = r.source || 'first1saudi'
      if (!usedByKey.has(k)) usedByKey.set(k, new Set())
      usedByKey.get(k)!.add(Number(r.wp_post_id))
    }
    const usedManhom = usedByKey.get('manhom') ?? new Set<number>()
    const usedFirst1 = usedByKey.get('first1saudi') ?? new Set<number>()
    const usedXArchiveUrls = new Set(
      (recent ?? []).filter(row => row.source === 'first1saudi-x-archive' && String(row.batch_date) >= since).map(row => String(row.post_url)),
    )
    const usedSubjectFingerprints = (recent ?? [])
      .map(row => subjectFingerprint(row.post_title))
      .filter(tokens => tokens.length > 0)

    // كم عنصراً من كل مصدر — افتراضياً ~2 إنجازات + 1 manhom لكل 3.
    let manhomTarget =
      sourceParam === 'manhom' ? count : sourceParam === 'first1saudi' ? 0 : Math.max(1, Math.round(count / 3))
    if (manhomTarget > count) manhomTarget = count
    const achTarget = count - manhomTarget

    const selected: SelectedItem[] = []
    const sourceDiagnostics = {
      first1: { fetched: 0, unseen: 0 },
      xArchive: { fetched: 0, unseen: 0, selected: 0 },
    }
    const countBySource = (s: string) => selected.filter(x => x.source === s).length
    const achCount = () => selected.filter(x => x.source !== 'manhom').length

    // ── 2) اختيار «الإنجازات»: تجميع من first1saudi + مصادر RSS ثم اختيار بتنويع المصدر ──
    if (achTarget > 0 && sourceParam !== 'manhom') {
      type Cand = { post: NewsPost; key: string }
      const pool: Cand[] = []

      // first1saudi: أقسام مختلفة
      try {
        const sections = (await fetchCategories()).filter(
          c => c.count >= MIN_SECTION_POSTS && !EXCLUDED_SECTIONS.has(c.name),
        )
        const archiveSections = [...sections]
          .sort(() => Math.random() - 0.5)
          .slice(0, FIRST1_ARCHIVE_SECTIONS)
        const archivePages = await Promise.all(
          archiveSections.flatMap(section =>
            Array.from({ length: FIRST1_ARCHIVE_PAGES }, (_, index) =>
              fetchPostsByCategory(section.id, FIRST1_ARCHIVE_PER_PAGE, index + 1)
                .then(posts => ({ section, posts })),
            ),
          ),
        )
        for (const { section, posts } of archivePages) {
          sourceDiagnostics.first1.fetched += posts.length
          for (const p of posts) {
            if (usedFirst1.has(p.id)) continue
            if (!isSocialNewsEligible(p.title, p.content)) continue
            sourceDiagnostics.first1.unseen++
            p.categoryNames = [section.name]
            pool.push({ post: p, key: 'first1saudi' })
          }
        }
      } catch { /* الموقع قد يتعذّر — نكمل من RSS */ }

      // مواد أرشيفية أصلية من حساب أول سعودي في X؛ تبقى دائما مقترحات غير مجدولة.
      try {
        const archivedPosts = await getFirst1XArchiveCandidates(usedXArchiveUrls)
        sourceDiagnostics.xArchive.fetched = archivedPosts.length
        for (const post of archivedPosts) {
          if (usedXArchiveUrls.has(post.url) || !isSocialNewsEligible(post.title, post.content)) continue
          sourceDiagnostics.xArchive.unseen++
          pool.push({ post, key: 'first1saudi-x-archive' })
        }
      } catch { /* لا نوقف الخطة اليومية إن لم يكتمل الاستيراد بعد. */ }

      // مصادر RSS (العربية…): مفلترة على إنجازات السعوديين
      for (const src of RSS_SOURCES) {
        try {
          const used = usedByKey.get(src.key) ?? new Set<number>()
          const items = await fetchRssCandidates(src)
          for (const p of items) { if (!used.has(p.id)) pool.push({ post: p, key: src.key }) }
        } catch { /* تجاهل مصدراً متعذّراً */ }
      }

      // سعوديبيديا: إنجازات/أوائل السعوديين (مصدر تدويري دائم الخضرة)
      try {
        const used = usedByKey.get('saudipedia') ?? new Set<number>()
        const items = await fetchSaudipediaCandidates()
        for (const p of items) { if (!used.has(p.id)) pool.push({ post: p, key: 'saudipedia' }) }
      } catch { /* تجاهل مصدراً متعذّراً */ }

      // سيدتي: صفحات وسم قصص/إنجازات السعوديات (رائدات/المرأة السعودية)
      for (const src of SAYIDATY_SOURCES) {
        try {
          const used = usedByKey.get(src.key) ?? new Set<number>()
          const items = await fetchSayidatyCandidates(src)
          for (const p of items) { if (!used.has(p.id)) pool.push({ post: p, key: src.key }) }
        } catch { /* تجاهل مصدراً متعذّراً */ }
      }

      pool.sort(() => Math.random() - 0.5)
      // Once archive material exists, reserve one eligible historical First1Saudi post for
      // the daily mix. Archive posts remain suggested only; they are never auto-scheduled.
      for (const c of pool) {
        if (c.key !== 'first1saudi-x-archive' || achCount() >= achTarget) continue
        const fingerprint = subjectFingerprint(c.post.title)
        if (isRepeatedSubject(fingerprint, usedSubjectFingerprints)) continue
        const img = c.post.imageUrl ?? await resolveImageUrl(c.post)
        if (!img) continue
        c.post.imageUrl = img
        selected.push({ post: c.post, source: c.key })
        usedSubjectFingerprints.push(fingerprint)
        sourceDiagnostics.xArchive.selected++
        break
      }
      // تمريرة أولى: مصدر مختلف لكل عنصر (تنويع)؛ ثم تمريرة ثانية للتعبئة.
      for (const preferDiverse of [true, false]) {
        const pickedKeys = new Set(selected.filter(s => s.source !== 'manhom').map(s => s.source))
        for (const c of pool) {
          if (achCount() >= achTarget) break
          if (selected.some(s => s.post.id === c.post.id && s.source === c.key)) continue
          if (preferDiverse && pickedKeys.has(c.key)) continue
          if (!isSocialNewsEligible(c.post.title, c.post.content)) continue
          const fingerprint = subjectFingerprint(c.post.title)
          if (isRepeatedSubject(fingerprint, usedSubjectFingerprints)) continue
          const img = c.post.imageUrl ?? await resolveImageUrl(c.post)
          if (!img) continue
          c.post.imageUrl = img
          pickedKeys.add(c.key)
          selected.push({ post: c.post, source: c.key })
          usedSubjectFingerprints.push(fingerprint)
        }
      }
    }

    // ── 3) اختيار من manhom (السعوديات الأوائل) + تعويض أي نقص ليبلغ المجموع count ──
    if (sourceParam !== 'first1saudi') {
      manhomTarget = Math.max(manhomTarget, count - achCount())
    }
    if (manhomTarget > 0) {
      const candidates = (await fetchManhomCandidates()).filter(p => !usedManhom.has(p.id))
      const shuffled = candidates.sort(() => Math.random() - 0.5)
      for (const p of shuffled) {
        if (countBySource('manhom') >= manhomTarget) break
        if (!p.imageUrl) continue
        const fingerprint = subjectFingerprint(p.title)
        if (isRepeatedSubject(fingerprint, usedSubjectFingerprints)) continue
        // صور المصدر رمادية — نضمن نسخة ملوّنة (تُلوَّن مرة وتُخزَّن).
        p.imageUrl = await ensureColorImage(p.id, p.imageUrl)
        selected.push({ post: p, source: 'manhom' })
        usedSubjectFingerprints.push(fingerprint)
      }
    }

    if (selected.length === 0) {
      console.warn('[daily-social] No eligible candidates', {
        ...sourceDiagnostics,
        selected: 0,
      })
      return NextResponse.json(
        { success: false, error: 'لا توجد عناصر صالحة من المصادر' },
        { status: 502 },
      )
    }

    // ── 4) تمرير كل عنصر في الاستوديو (بالتوازي للبقاء ضمن حد المهلة) ──
    // نوزّع نمط تصميم مختلفاً على كل منشور لضمان تنوّع بصري (لا نمط واحد متكرّر).
    const styles = shuffledPosterStyles()
    console.info('[daily-social] Candidate selection', {
      ...sourceDiagnostics,
      selected: selected.length,
      selectedFirst1: selected.filter(item => item.source === 'first1saudi').length,
    })
    const settled = await Promise.allSettled(
      selected.map(({ post, source }, i) =>
        runStudioPipeline({
          title: post.title,
          content: post.content,
          sourceImages: [post.imageUrl as string],
          extraInfo: source === 'manhom' ? MANHOM_NOTE : undefined,
          styleDirective: styles[i % styles.length],
        }).then(studio => ({ post, source, tweets: studio.tweets, designUrl: studio.imageUrl, concept: studio.chosenConcept, hostedSource: studio.sourceImages[0] ?? (post.imageUrl as string) })),
      ),
    )
    const results: ProcessedItem[] = []
    const errors: { title: string; error: string }[] = []
    selected.forEach(({ post }, i) => {
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
    // تصنيف تلقائي لقسم مجلة المبدعين (قواعد + ذكاء اصطناعي احتياطي) لكل منشور.
    const sections = await Promise.all(
      results.map(r => classifySection({ title: r.post.title, content: r.post.content, raw: r.post.categoryNames[0] })),
    )
    const rows = results.map((r, i) => ({
      wp_post_id: r.post.id,
      post_url: r.post.url,
      post_title: r.post.title,
      category: sections[i],
      source: r.source,
      source_content: r.post.content,
      source_image_url: r.hostedSource,
      design_image_url: r.designUrl,
      tweets: r.tweets,
      chosen_concept: r.concept,
      batch_date: today,
      status: 'suggested',
      email_sent: false,
    }))
    const { data: inserted } = await sc.from('social_schedule').insert(rows).select('id')
    const insertedIds = (inserted ?? []).map(r => r.id)

    // تسجيل تصاميم اليوم في السجلّ الموحّد (مرشّحي نشرة «النخبة في ٧»)
    try {
      await sc.from('generated_designs').insert(results.map((r, i) => ({
        source: 'daily',
        title: r.post.title,
        content: r.post.content,
        category: sections[i],
        image_url: r.designUrl,
        source_image_url: r.hostedSource,
      })))
    } catch { /* تجاهل أخطاء التسجيل */ }

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
  source: SourceKind
  tweets: string
  designUrl: string
  concept: string
  hostedSource: string
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
      const hasUrl = !!r.post.url
      const titleHtml = hasUrl
        ? `<a href="${escapeHtml(r.post.url)}" style="color:#0D3D47;font-size:18px;font-weight:bold;text-decoration:none">${escapeHtml(r.post.title)}</a>`
        : `<span style="color:#0D3D47;font-size:18px;font-weight:bold">${escapeHtml(r.post.title)}</span>`
      const sourceLink = hasUrl
        ? `🔗 <a href="${escapeHtml(r.post.url)}" style="color:#1A8B9F">الخبر الأصلي</a> &nbsp;|&nbsp; `
        : ''
      return `
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin:0 0 28px;background:#fff">
        <div style="background:#0A2D35;color:#FFD700;padding:12px 18px;font-weight:bold;font-size:16px">
          منشور ${i + 1} — ${escapeHtml(r.post.categoryNames[0] ?? 'منوّع')}
        </div>
        <div style="padding:18px">
          ${titleHtml}
          <div style="margin:16px 0">
            <img src="${escapeHtml(r.designUrl)}" alt="التصميم" style="width:100%;max-width:480px;border-radius:10px;display:block" />
          </div>
          <div style="background:#f8fafc;border-radius:10px;padding:14px 16px;margin-top:8px">
            <div style="font-weight:bold;color:#2D8B3F;margin-bottom:8px">📝 التغريدات المقترحة:</div>
            <div style="color:#1e293b;font-size:15px;line-height:2">${tweetsHtml}</div>
          </div>
          <div style="margin-top:12px;font-size:13px;color:#64748b">
            ${sourceLink}🖼️ <a href="${escapeHtml(r.designUrl)}" style="color:#1A8B9F">تحميل التصميم</a>
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
