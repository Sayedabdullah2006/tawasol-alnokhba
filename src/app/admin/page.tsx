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
  const [stats, setStats] = useState({ total: 0, pending: 0, revenue: 0, monthRevenue: 0 })
  const [topCategories, setTopCategories] = useState<{ category: string; nameAr: string; count: number }[]>([])

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

      const { data: reqs } = await supabase
        .from('publish_requests')
        .select('*')

      const requests = reqs ?? []
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      setStats({
        total: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        revenue: requests.filter(r => r.status === 'completed').reduce((s, r) => s + (r.final_total ?? 0), 0),
        monthRevenue: requests
          .filter(r => r.status === 'completed' && r.created_at >= monthStart)
          .reduce((s, r) => s + (r.final_total ?? 0), 0),
      })

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
    <div className="p-6">
      <h1 className="text-2xl font-black text-dark mb-6">الإحصائيات</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'إجمالي الطلبات', value: stats.total, icon: '📋' },
          { label: 'الطلبات المعلقة', value: stats.pending, icon: '⏳' },
          { label: 'الإيرادات الإجمالية', value: `${formatNumber(stats.revenue)} ر.س`, icon: '💰' },
          { label: 'إيرادات هذا الشهر', value: `${formatNumber(stats.monthRevenue)} ر.س`, icon: '📅' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-5 text-center">
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-2xl font-black text-dark">{s.value}</div>
            <div className="text-sm text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

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
