'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CATEGORIES } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminStatsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, pending: 0, revenue: 0, monthRevenue: 0, outstanding: 0, conversionRate: 0, paidCount: 0 })
  const [topCategories, setTopCategories] = useState<{ category: string; nameAr: string; count: number }[]>([])
  const [funnel, setFunnel] = useState<{ label: string; count: number; pctOfPrev: number; pctOfTotal: number }[]>([])

  useEffect(() => {
    const load = async () => {
      // Verify admin
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      // Get accurate total count (bypasses any row-fetch limit)
      const { count: totalCount } = await supabase
        .from('publish_requests')
        .select('id', { count: 'exact', head: true })

      // Fetch all rows in pages to avoid PostgREST default row limit
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

      setStats({
        total: finalTotal,
        pending: requests.filter(r => r.status === 'pending').length,
        revenue: requests.filter(r => r.status === 'completed').reduce((s, r) => s + (r.final_total ?? 0), 0),
        monthRevenue: requests
          .filter(r => r.status === 'completed' && r.created_at >= monthStart)
          .reduce((s, r) => s + (r.final_total ?? 0), 0),
        // فقط الطلبات التي أُرسل لها عرض سعر وبانتظار موافقة العميل (لم تُغلق ولم تُدفع)
        outstanding: requests
          .filter(r => r.status === 'quoted')
          .reduce((s, r) => s + (r.final_total ?? r.admin_quoted_price ?? 0), 0),
        paidCount,
        conversionRate: finalTotal > 0 ? (paidCount / finalTotal) * 100 : 0,
      })

      // Funnel — count requests that reached each stage based on timestamps + status
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

      // Top categories
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

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-black text-dark mb-6">الإحصائيات</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'إجمالي الطلبات', value: stats.total, icon: '📋' },
          { label: 'الطلبات المعلقة', value: stats.pending, icon: '⏳' },
          { label: 'الإيرادات الإجمالية', value: `${formatNumber(stats.revenue)} ر.س`, icon: '💰' },
          { label: 'إيرادات هذا الشهر', value: `${formatNumber(stats.monthRevenue)} ر.س`, icon: '📅' },
          { label: 'عروض بانتظار الموافقة', value: `${formatNumber(stats.outstanding)} ر.س`, icon: '🧾' },
          {
            label: `معدل التحويل (${stats.paidCount}/${stats.total})`,
            value: `${stats.conversionRate.toFixed(1)}%`,
            icon: '📈',
          },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-4 sm:p-5 text-center">
            <div className="text-2xl sm:text-3xl mb-2">{s.icon}</div>
            <div className="text-base sm:text-2xl font-black text-dark break-words leading-tight">{s.value}</div>
            <div className="text-xs sm:text-sm text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {funnel.length > 0 && funnel[0].count > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5 mb-6">
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

      {stats.total === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4 opacity-30">📊</div>
          <p className="text-muted">لا توجد بيانات بعد — ستظهر الإحصائيات عند استلام الطلبات</p>
        </div>
      )}
    </div>
  )
}
