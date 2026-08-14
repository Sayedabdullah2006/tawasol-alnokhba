import Link from 'next/link'
import { redirect } from 'next/navigation'
import XInsightsSyncButton from '@/components/admin/XInsightsSyncButton'
import XGrowthCenter from '@/components/admin/XGrowthCenter'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getXInsights, type XInsightPost, type XInsightsRange } from '@/lib/x-insights'
import { xConfigured } from '@/lib/x-oauth'
import { getXGrowthDashboard } from '@/lib/x-growth'

export const dynamic = 'force-dynamic'

const rangeOptions: Array<{ value: XInsightsRange; label: string }> = [
  { value: '30d', label: '30 يوماً' },
  { value: '90d', label: '90 يوماً' },
  { value: '365d', label: 'سنة' },
  { value: 'all', label: 'كل الأرشيف' },
]

function formatNumber(value: number) {
  return new Intl.NumberFormat('ar-SA', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

function scoreTone(score: number) {
  if (score >= 75) return 'bg-green/10 text-green border-green/20'
  if (score >= 55) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-2 text-3xl font-black text-dark">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted">{note}</p>
    </article>
  )
}

function PostRow({ post, rank }: { post: XInsightPost; rank?: number }) {
  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          {rank && <span className="rounded-full bg-dark px-2 py-1 font-bold text-white">#{rank}</span>}
          <span>{formatDate(post.createdAt)}</span>
          <span>ثقة {post.confidence}</span>
        </div>
        <a href={post.url} target="_blank" rel="noreferrer" className="line-clamp-3 text-sm font-bold leading-7 text-dark hover:text-green">
          {post.text}
        </a>
        <p className="mt-2 text-xs font-bold text-muted">{post.verdict}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:max-w-[390px] lg:justify-end">
        <span className={`rounded-xl border px-3 py-2 text-center ${scoreTone(post.score)}`}><b className="block text-lg">{post.score}</b><small>الدرجة</small></span>
        <Metric label="ظهور" value={post.impressions} />
        <Metric label="إعجاب" value={post.likes} />
        <Metric label="رد" value={post.replies} />
        <Metric label="إعادة" value={post.reposts} />
        <Metric label="اقتباس" value={post.quotes} />
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <span className="min-w-[62px] rounded-xl bg-black/[0.035] px-2 py-2 text-center text-xs text-muted"><b className="block text-sm text-dark">{formatNumber(value)}</b>{label}</span>
}

export default async function XInsightsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const query = await searchParams
  const requestedRange = query.range
  const range: XInsightsRange = requestedRange === '30d' || requestedRange === '90d' || requestedRange === '365d' || requestedRange === 'all'
    ? requestedRange
    : '90d'
  const insights = await getXInsights(range)
  const growth = await getXGrowthDashboard(insights)
  const environmentConfigured = xConfigured()
  const hasScoredPosts = insights.summary.scoredPosts > 0
  const followers = Number(insights.account?.public_metrics?.followers_count ?? 0)
  const sortedPosts = [...insights.posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6" dir="rtl">
      <header className="overflow-hidden rounded-3xl border border-white/70 bg-[linear-gradient(135deg,rgba(13,74,53,.96),rgba(22,112,78,.88))] p-5 text-white shadow-xl md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-white/70">
              <span className="rounded-full bg-white/10 px-3 py-1">تحليلات مباشرة من X</span>
              {insights.connection?.x_username && <span>@{insights.connection.x_username}</span>}
            </div>
            <h1 className="text-2xl font-black md:text-3xl">جودة الحساب والمنشورات</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">مؤشر داخلي مستلهم من إشارات ترتيب X، يقارن الردود والاقتباسات والتضخيم والوصول بتاريخ الحساب نفسه.</p>
          </div>
          <XInsightsSyncButton disabled={!insights.connection || !environmentConfigured} />
        </div>
        <div className="mt-6 flex flex-wrap items-end gap-5">
          <div><p className="text-xs text-white/60">مؤشر الحساب مقابل تاريخه</p><p className="text-6xl font-black">{hasScoredPosts ? insights.summary.accountScore : '—'}</p></div>
          <div className="pb-2 text-sm text-white/75">
            <p>{hasScoredPosts ? `${insights.summary.recentTrend > 0 ? '▲' : insights.summary.recentTrend < 0 ? '▼' : '—'} الاتجاه الحديث ${Math.abs(insights.summary.recentTrend)} نقطة` : 'الاتجاه غير متاح قبل استرجاع بيانات الظهور'}</p>
            <p className="mt-1">{followers ? `${formatNumber(followers)} متابع` : 'تعذر جلب عدد المتابعين حالياً'}</p>
          </div>
        </div>
      </header>

      {!insights.connection && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          حساب X غير متصل. <Link href="/admin/integrations" className="font-black underline">انتقل إلى صفحة الربط</Link> لتفعيل التحديث المباشر.
        </section>
      )}

      {insights.connection && !environmentConfigured && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
          تعذر تحديث بيانات X لأن إعدادات الربط غير موجودة في بيئة التشغيل المحلية. يجب تشغيل التطبيق بالقيم نفسها المستخدمة عند ربط الحساب، وبالأخص <span dir="ltr" className="font-mono font-bold">X_TOKEN_ENCRYPTION_KEY</span>. لا تُنشئ مفتاحًا جديدًا، لأنه لن يفك تشفير الرموز المحفوظة.
        </section>
      )}

      {insights.needsSync && insights.connection && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          آخر منشور محفوظ يعود إلى {insights.lastCapturedAt ? formatDate(insights.lastCapturedAt) : 'وقت غير معروف'}. اضغط «تحديث البيانات من X» لالتقاط منشورات السنة الحالية وأحدث أرقامها.
        </section>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="الفترة الزمنية">
        {rangeOptions.map(option => (
          <Link key={option.value} href={`/admin/x-insights?range=${option.value}`} className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${range === option.value ? 'border-green bg-green text-white' : 'border-border bg-card text-muted hover:text-dark'}`}>
            {option.label}
          </Link>
        ))}
      </nav>

      <XGrowthCenter initial={growth} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="المنشورات المقيمة" value={formatNumber(insights.summary.totalPosts)} note={`${insights.summary.scoredPosts} منشوراً لديه بيانات ظهور قابلة للمقارنة`} />
        <StatCard label="إجمالي الظهور" value={formatNumber(insights.summary.totalImpressions)} note="مجموع مرات الظهور في الفترة المختارة" />
        <StatCard label="معدل التفاعل" value={`${insights.summary.engagementRate}%`} note="الإعجاب والرد وإعادة النشر والاقتباس والحفظ" />
        <StatCard label="متوسط جودة المنشور" value={`${insights.summary.averageScore}/100`} note="مقارنة داخلية بتاريخ الحساب مع مراعاة حجم العينة" />
      </section>

      <section className="space-y-3">
        <div><h2 className="text-xl font-black text-dark">أفضل المنشورات</h2><p className="mt-1 text-xs text-muted">الترتيب يفضل الحوار والاقتباس والتضخيم، وليس الإعجاب وحده.</p></div>
        {insights.topPosts.length ? insights.topPosts.map((post, index) => <PostRow key={post.id} post={post} rank={index + 1} />) : <EmptyState />}
      </section>

      <section className="space-y-3">
        <div><h2 className="text-xl font-black text-dark">كل المنشورات</h2><p className="mt-1 text-xs text-muted">مرتبة زمنياً. الدرجة تقارن المنشور ببقية منشورات الفترة المختارة.</p></div>
        {sortedPosts.length ? sortedPosts.map(post => <PostRow key={post.id} post={post} />) : <EmptyState />}
      </section>

      <aside className="rounded-2xl border border-border bg-card p-4 text-xs leading-6 text-muted">
        هذه ليست درجة رسمية من X. لا تتوفر عبر الواجهة إشارات «غير مهتم» والكتم والحظر والبلاغ لكل منشور، لذلك لا تدخل في الحساب. الأوزان تعطي الرد والاقتباس أهمية أعلى من الإعجاب، ثم تطبّع النتيجة مقابل تاريخ الحساب وتخفض الثقة عند قلة الانطباعات.
      </aside>
    </main>
  )
}

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-sm text-muted">لا توجد منشورات قابلة للتقييم في هذه الفترة. حدّث البيانات من X أو اختر فترة أطول.</div>
}
