'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CATEGORIES } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

type PayMethod = 'moyasar' | 'tamara' | 'direct'

// تصنيف طريقة الدفع من إشارات الطلب (معرّف البوابة أو نص payment_method).
function classifyPayMethod(r: any): PayMethod {
  const pm = String(r.payment_method || '')
  if (r.tamara_order_id || /تمارا|tamara/i.test(pm)) return 'tamara'
  if (r.moyasar_payment_id || /\*\*\*|visa|mada|master|card|بطاقة|amex|apple|stc/i.test(pm)) return 'moyasar'
  return 'direct' // تحويل بنكي مباشر أكّده الأدمن (بلا معرّف بوابة)
}

const PAY_METHOD_META: { key: PayMethod; label: string; color: string }[] = [
  { key: 'moyasar', label: 'مدفوعات ميسر', color: '#2D8B3F' },
  { key: 'tamara', label: 'مدفوعات تمارا', color: '#E4A11B' },
  { key: 'direct', label: 'التحويل المباشر', color: '#1A8B9F' },
]

const PAID_STATUSES = ['paid', 'in_progress', 'content_review', 'completed']
// طلب مؤكّد دفعه فعلاً (paid_at أو حالة مدفوعة) وبمبلغ > 0
function isConfirmedPaid(r: any): boolean {
  return (r.paid_at != null || PAID_STATUSES.includes(r.status)) && (r.final_total ?? 0) > 0
}

export default function AdminStatsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    freeCount: 0,
    paidCount: 0,
    monthPaidCount: 0,
    monthRevenue: 0,
    revenue: 0,
    totalPaidRevenue: 0,
    outstanding: 0,
    conversionRate: 0,
  })
  const [topCategories, setTopCategories] = useState<{ category: string; nameAr: string; count: number }[]>([])
  // كل الطلبات — لحساب إحصاءات الشهر المختار ديناميكياً (تتبع فلتر الشهر)
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [funnel, setFunnel] = useState<{ label: string; count: number; pctOfPrev: number; pctOfTotal: number }[]>([])

  // فلتر الشهر في بطاقة الهدف
  const initialMonthKey = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const [monthlyRevenueByKey, setMonthlyRevenueByKey] = useState<Record<string, number>>({})
  const [availableMonths, setAvailableMonths] = useState<string[]>([initialMonthKey])
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(initialMonthKey)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      const { count: totalCount } = await supabase
        .from('publish_requests')
        .select('id', { count: 'exact', head: true })

      const PAGE = 1000
      const requests: any[] = []
      const total = totalCount ?? 0
      for (let from = 0; from < Math.max(total, 1); from += PAGE) {
        const { data: chunk } = await supabase
          .from('publish_requests')
          .select('*')
          .range(from, from + PAGE - 1)
        if (!chunk || chunk.length === 0) break
        requests.push(...chunk)
        if (chunk.length < PAGE) break
      }

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const paidStatuses = ['paid', 'in_progress', 'content_review', 'completed']
      const finalTotal = total || requests.length
      const paidCount = requests.filter(r => paidStatuses.includes(r.status)).length
      const freeCount = finalTotal - paidCount

      const monthPaidCount = requests.filter(r =>
        paidStatuses.includes(r.status) && r.created_at >= monthStart
      ).length

      // الإيرادات: الطلبات التي تأكّد دفعها فعلاً
      // paid_at يُسجَّل عند تأكيد Moyasar/Tamara أو عند تأكيد الأدمن للتحويل البنكي
      // الفلتر الاحتياطي بالحالة يغطي السجلات القديمة قبل إضافة paid_at
      const isConfirmedPaid = (r: any) =>
        (r.paid_at != null || paidStatuses.includes(r.status)) && (r.final_total ?? 0) > 0

      const monthRevenue = requests
        .filter(r => isConfirmedPaid(r) && r.created_at >= monthStart)
        .reduce((s, r) => s + (r.final_total ?? 0), 0)

      const totalPaidRevenue = requests
        .filter(isConfirmedPaid)
        .reduce((s, r) => s + (r.final_total ?? 0), 0)

      // نحتفظ بكل الطلبات لحساب إحصاءات الشهر المختار ديناميكياً (يتبع فلتر الشهر)
      setAllRequests(requests)

      // إيرادات لكل شهر (YYYY-MM) لاستخدامها في فلتر بطاقة الهدف
      const revenueByMonth: Record<string, number> = {}
      const monthsWithData = new Set<string>()
      for (const r of requests) {
        if (!r.created_at) continue
        const d = new Date(r.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthsWithData.add(key)
        if (isConfirmedPaid(r)) {
          revenueByMonth[key] = (revenueByMonth[key] ?? 0) + (r.final_total ?? 0)
        }
      }
      const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      monthsWithData.add(nowKey)
      setMonthlyRevenueByKey(revenueByMonth)
      setAvailableMonths(Array.from(monthsWithData).sort().reverse())

      setStats({
        total: finalTotal,
        pending: requests.filter(r => r.status === 'pending').length,
        freeCount,
        paidCount,
        monthPaidCount,
        monthRevenue,
        revenue: requests.filter(isConfirmedPaid).reduce((s, r) => s + (r.final_total ?? 0), 0),
        totalPaidRevenue,
        outstanding: requests
          .filter(r => r.status === 'quoted')
          .reduce((s, r) => s + (r.final_total ?? r.admin_quoted_price ?? 0), 0),
        conversionRate: finalTotal > 0 ? (paidCount / finalTotal) * 100 : 0,
      })

      const paidLikeStatuses = ['paid', 'in_progress', 'content_review', 'completed']
      const stages = [
        { label: 'تم استقبال الطلب', count: requests.length },
        { label: 'تم إرسال العرض', count: requests.filter(r => r.quoted_at).length },
        { label: 'اعتمد العميل', count: requests.filter(r => r.approved_at).length },
        { label: 'تم الدفع', count: requests.filter(r => paidLikeStatuses.includes(r.status)).length },
        { label: 'اكتمل الطلب', count: requests.filter(r => r.status === 'completed').length },
      ]
      const totalForPct = stages[0].count || 1
      setFunnel(
        stages.map((s, i) => {
          const prev = i === 0 ? s.count : stages[i - 1].count
          return {
            label: s.label,
            count: s.count,
            pctOfPrev: prev > 0 ? (s.count / prev) * 100 : 0,
            pctOfTotal: (s.count / totalForPct) * 100,
          }
        })
      )

      const catMap: Record<string, number> = {}
      requests.forEach(r => { catMap[r.category] = (catMap[r.category] ?? 0) + 1 })
      const sorted = Object.entries(catMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([category, count]) => ({
          category,
          nameAr: CATEGORIES.find(c => c.id === category)?.nameAr ?? category,
          count,
        }))
      setTopCategories(sorted)

      setLoading(false)
    }
    load()
  }, [supabase, router])

  // إحصاءات الشهر المختار (تتبع فلتر «الهدف الشهري»): عدد المدفوعة + الإيراد + توزيع طرق الدفع
  const monthStats = useMemo(() => {
    const [y, m] = selectedMonthKey.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 1)
    const inMonth = (r: any) => {
      if (!r.created_at) return false
      const d = new Date(r.created_at)
      return d >= start && d < end
    }
    let count = 0
    let revenue = 0
    const agg: Record<PayMethod, { amount: number; count: number }> = {
      moyasar: { amount: 0, count: 0 }, tamara: { amount: 0, count: 0 }, direct: { amount: 0, count: 0 },
    }
    for (const r of allRequests) {
      if (!inMonth(r)) continue
      if (PAID_STATUSES.includes(r.status)) count++
      if (isConfirmedPaid(r)) {
        revenue += (r.final_total ?? 0)
        const mm = classifyPayMethod(r)
        agg[mm].amount += (r.final_total ?? 0)
        agg[mm].count += 1
      }
    }
    const byMethod = PAY_METHOD_META.map(mm => ({ ...mm, amount: agg[mm.key].amount, count: agg[mm.key].count }))
    return { count, revenue, byMethod }
  }, [allRequests, selectedMonthKey])

  if (loading) return <LoadingSpinner size="lg" />

  // قاعدة الهدف الشهري: 15,000 ر.س في مايو 2026 ويزيد 5% كل شهر
  const TARGET_BASE = 15000
  const TARGET_MONTHLY_GROWTH = 0.05
  const TARGET_BASELINE_YEAR = 2026
  const TARGET_BASELINE_MONTH = 4 // مايو (0-indexed)

  // الشهر المختار في الفلتر — تتحدث كل أرقام بطاقة الهدف بناءً عليه
  const [selYear, selMonth] = selectedMonthKey.split('-').map(Number)
  const selectedDate = new Date(selYear, selMonth - 1, 1)
  const selectedMonthName = selectedDate.toLocaleString('ar', { month: 'long', calendar: 'gregory' })
  const selectedRevenue = monthlyRevenueByKey[selectedMonthKey] ?? 0

  const prevDate = new Date(selYear, selMonth - 2, 1)
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  const prevRevenue = monthlyRevenueByKey[prevKey] ?? 0

  const monthsFromBaseline =
    (selYear - TARGET_BASELINE_YEAR) * 12 + ((selMonth - 1) - TARGET_BASELINE_MONTH)
  const monthlyTarget = Math.round(
    TARGET_BASE * Math.pow(1 + TARGET_MONTHLY_GROWTH, monthsFromBaseline)
  )

  // مقارنة الإيرادات: الشهر المختار vs الشهر الذي قبله
  const revenueGrowth = prevRevenue > 0
    ? ((selectedRevenue - prevRevenue) / prevRevenue) * 100
    : selectedRevenue > 0 ? 100 : 0
  const isRevenueUp = revenueGrowth >= 0

  // نسبة تحقيق الهدف
  const goalAchieved = monthlyTarget > 0
    ? Math.min((selectedRevenue / monthlyTarget) * 100, 100)
    : 0

  const avgOrderRevenue = stats.paidCount > 0 ? stats.totalPaidRevenue / stats.paidCount : 0
  const remainingRevenue = Math.max(0, monthlyTarget - selectedRevenue)
  const ordersNeeded = avgOrderRevenue > 0 ? Math.ceil(remainingRevenue / avgOrderRevenue) : null
  const goalMet = selectedRevenue >= monthlyTarget

  const isCurrentMonth = selectedMonthKey === initialMonthKey

  const freePercent = stats.total > 0 ? (stats.freeCount / stats.total) * 100 : 0
  const paidPercent = stats.total > 0 ? (stats.paidCount / stats.total) * 100 : 0

  if (stats.total === 0) return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-black text-dark mb-6">الإحصائيات</h1>
      <div className="text-center py-20">
        <div className="text-6xl mb-4 opacity-20">📊</div>
        <p className="text-muted">لا توجد بيانات بعد — ستظهر الإحصائيات عند استلام الطلبات</p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="glass-panel flex flex-wrap items-end justify-between gap-4 rounded-lg p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold text-gold">لوحة الإدارة</p>
          <h1 className="mt-1 text-2xl font-black text-dark sm:text-3xl">الإحصائيات</h1>
          <p className="mt-1 text-sm text-muted">نظرة شاملة على أداء المنصة والطلبات.</p>
        </div>
        <span className="rounded-lg border border-green/15 bg-green/10 px-3 py-2 text-xs font-bold text-green">تحديث مباشر للبيانات</span>
      </div>

      {/* ── بطاقة إجمالي الطلبات مع التقسيم ── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-sm text-muted">إجمالي الطلبات</p>
            <p className="text-5xl font-black text-dark mt-1 leading-none">{stats.total}</p>
          </div>
          <div className="text-3xl">📋</div>
        </div>

        {/* شريط التقسيم */}
        <div className="h-3 bg-cream rounded-full overflow-hidden mb-4 flex">
          <div
            className="h-full bg-gold/70 transition-all"
            style={{ width: `${freePercent}%` }}
          />
          <div
            className="h-full bg-green transition-all"
            style={{ width: `${paidPercent}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-cream rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-gold/70 shrink-0" />
              <p className="text-xs text-muted">الطلبات غير المدفوعة</p>
            </div>
            <p className="text-2xl font-black text-dark">{stats.freeCount}</p>
            <p className="text-xs text-muted mt-1">{freePercent.toFixed(1)}% من الإجمالي</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'color-mix(in srgb, var(--color-green) 10%, transparent)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green shrink-0" />
              <p className="text-xs text-muted">الطلبات المدفوعة</p>
            </div>
            <p className="text-2xl font-black text-green">{stats.paidCount}</p>
            <p className="text-xs text-muted mt-1">{paidPercent.toFixed(1)}% من الإجمالي</p>
          </div>
        </div>
      </div>

      {/* ── الطلبات المدفوعة شهريًا + المقارنة ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* معدل الطلبات المدفوعة هذا الشهر */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-muted leading-tight">الطلبات المدفوعة<br />{isCurrentMonth ? 'هذا الشهر' : selectedMonthName}</p>
            <div className="text-2xl">📅</div>
          </div>
          <p className="text-4xl font-black text-dark">{monthStats.count}</p>
          <p className="text-xs text-muted mt-2">طلب مدفوع في {selectedMonthName} {selYear}</p>

          {monthStats.count > 0 && (
            <div className="mt-4">
              <div className="h-2 bg-cream rounded-full overflow-hidden">
                <div
                  className="h-full bg-green rounded-full"
                  style={{ width: `${Math.min((monthStats.count / Math.max(stats.paidCount, 1)) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {((monthStats.count / Math.max(stats.paidCount, 1)) * 100).toFixed(0)}% من إجمالي المدفوعة
              </p>
            </div>
          )}

          {/* ── توزيع مبلغ الشهر على طرق الدفع ── */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-dark">توزيع مبالغ {isCurrentMonth ? 'الشهر' : selectedMonthName} على طرق الدفع</p>
              <p className="text-xs font-black text-green">
                {formatNumber(monthStats.byMethod.reduce((s, m) => s + m.amount, 0))} ر.س
              </p>
            </div>
            {(() => {
              const monthTotal = monthStats.byMethod.reduce((s, m) => s + m.amount, 0)
              if (monthTotal <= 0) {
                return <p className="text-xs text-muted">لا مدفوعات مؤكّدة في {selectedMonthName} بعد.</p>
              }
              return (
                <div className="space-y-2.5">
                  {monthStats.byMethod.map(m => {
                    const pct = (m.amount / monthTotal) * 100
                    return (
                      <div key={m.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                            <span className="text-dark font-medium truncate">{m.label}</span>
                            {m.count > 0 && <span className="text-muted shrink-0">({m.count})</span>}
                          </span>
                          <span className="font-bold text-dark shrink-0 ms-2">
                            {formatNumber(m.amount)} ر.س
                            <span className="text-muted font-normal"> · {pct.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-cream rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: m.color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* الهدف الشهري — قاعدة 15,000 ر.س + 5% شهرياً */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-muted leading-tight">الهدف الشهري</p>
              <p className="text-xs text-muted opacity-70 mt-0.5">{formatNumber(monthlyTarget)} ر.س · يزيد 5% كل شهر</p>
            </div>
            <div className="text-2xl">🎯</div>
          </div>

          {/* فلتر اختيار الشهر */}
          <select
            value={selectedMonthKey}
            onChange={e => setSelectedMonthKey(e.target.value)}
            className="w-full mb-3 bg-cream border border-border rounded-lg px-3 py-2 text-sm font-medium text-dark"
          >
            {availableMonths.map(key => {
              const [y, m] = key.split('-').map(Number)
              const label = new Date(y, m - 1, 1)
                .toLocaleString('ar', { month: 'long', year: 'numeric', calendar: 'gregory' })
              return <option key={key} value={key}>{label}{key === initialMonthKey ? ' (الحالي)' : ''}</option>
            })}
          </select>

          {/* الإيراد الحالي مع مؤشر النمو */}
          <div className="flex items-end gap-2 mb-0.5">
            <p className="text-2xl font-black text-dark leading-none">
              {formatNumber(selectedRevenue)}
            </p>
            <span className="text-sm text-muted mb-0.5">ر.س</span>
            {(prevRevenue > 0 || selectedRevenue > 0) && (
              <span className={`text-sm font-bold mb-0.5 ${isRevenueUp ? 'text-green' : 'text-red-500'}`}>
                {isRevenueUp ? '▲' : '▼'} {Math.abs(revenueGrowth).toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted mb-4">
            {selectedMonthName} {selYear}{isCurrentMonth ? ' (هذا الشهر)' : ''}
          </p>

          {/* شريط تحقيق الهدف */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-muted mb-1.5">
              <span>تحقيق الهدف</span>
              <span className={`font-bold ${goalAchieved >= 100 ? 'text-green' : 'text-dark'}`}>
                {goalAchieved.toFixed(0)}%
              </span>
            </div>
            <div className="h-2.5 bg-cream rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  goalAchieved >= 100 ? 'bg-green' : goalAchieved >= 70 ? 'bg-gold' : 'bg-red-400'
                }`}
                style={{ width: `${goalAchieved}%` }}
              />
            </div>
          </div>

          {/* مقارنة الإيراد بالهدف */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-green/10 rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1">{selectedMonthName}</p>
              <p className="text-base font-black text-green leading-tight">
                {formatNumber(selectedRevenue)}
              </p>
              <p className="text-xs text-muted">ر.س</p>
            </div>
            <div className="bg-cream rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1">الهدف الشهري</p>
              <p className="text-base font-black text-dark leading-tight">
                {formatNumber(monthlyTarget)}
              </p>
              <p className="text-xs text-muted">ر.س</p>
            </div>
          </div>

          {/* المتبقي لتحقيق الهدف */}
          {monthlyTarget > 0 && (
            <div className={`mt-3 rounded-xl p-3 text-center text-xs ${goalMet ? 'bg-green/10' : 'bg-amber-50'}`}>
              {goalMet ? (
                <p className="font-bold text-green">تحقق الهدف في {selectedMonthName}!</p>
              ) : (
                <>
                  <p className="text-muted mb-0.5">المتبقي لتحقيق الهدف</p>
                  <p className="font-black text-dark text-sm">
                    {formatNumber(remainingRevenue)} ر.س
                    {ordersNeeded !== null && (
                      <span className="font-normal text-muted">
                        {' '}· ~{ordersNeeded} طلب
                      </span>
                    )}
                  </p>
                  {avgOrderRevenue > 0 && (
                    <p className="text-muted mt-0.5">
                      بمعدل {formatNumber(Math.round(avgOrderRevenue))} ر.س / طلب
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── الإيرادات ومعدل التحويل ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'الإيرادات الإجمالية', value: `${formatNumber(stats.revenue)} ر.س`, icon: '💰' },
          { label: `إيرادات ${isCurrentMonth ? 'هذا الشهر' : selectedMonthName}`, value: `${formatNumber(monthStats.revenue)} ر.س`, icon: '💵' },
          { label: 'عروض بانتظار الموافقة', value: `${formatNumber(stats.outstanding)} ر.س`, icon: '🧾' },
          { label: `معدل التحويل (${stats.paidCount}/${stats.total})`, value: `${stats.conversionRate.toFixed(1)}%`, icon: '📈' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-4 text-center">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-base font-black text-dark break-words leading-tight">{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── قمع التحويل ── */}
      {funnel.length > 0 && funnel[0].count > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-bold text-dark mb-1">قمع التحويل</h2>
          <p className="text-xs text-muted mb-4">نسبة الانتقال من كل مرحلة للتالية — اكتشف أين يتسرّب العملاء.</p>
          <div className="space-y-3">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-dark">{f.label}</span>
                  <span className="text-muted text-xs">
                    <strong className="text-dark">{f.count}</strong>
                    {i > 0 && (
                      <span className={`ms-2 ${f.pctOfPrev >= 80 ? 'text-green' : f.pctOfPrev >= 50 ? 'text-orange-600' : 'text-red-600'}`}>
                        ({f.pctOfPrev.toFixed(1)}% من السابق)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-3 bg-cream rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-green to-gold rounded-full transition-all"
                    style={{ width: `${Math.max(f.pctOfTotal, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── الفئات الأكثر طلباً ── */}
      {topCategories.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-bold text-dark mb-4">الفئات الأكثر طلباً</h2>
          <div className="space-y-3">
            {topCategories.map((tc, i) => (
              <div key={tc.category} className="flex items-center gap-3">
                <span className="text-sm font-bold text-muted w-6">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-dark">{tc.nameAr}</span>
                <span className="text-sm font-bold text-green">{tc.count} طلب</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
