'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CATEGORIES, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import { fixTextDirection } from '@/lib/text-utils'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminRequestsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // Removed drawer-related state since we now use full-page view

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const { data: reqs } = await supabase
      .from('publish_requests')
      .select('*')
      .order('created_at', { ascending: false })

    setRequests(reqs ?? [])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

  // Removed drawer useEffect

  const filteredRequests = requests.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        r.client_name?.toLowerCase().includes(q) ||
        r.client_email?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.content?.toLowerCase().includes(q) ||
        generateRequestNumber(r.request_number).toLowerCase().includes(q)
      )
    }
    return true
  })

  // قطع المحتوى لعرض جزء منه فقط
  const truncateContent = (text: string, maxLength: number = 60) => {
    if (!text) return ''
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  const openRequest = (req: any) => {
    // Navigate to full-page request view
    router.push(`/admin/requests/${req.id}`)
  }

  // Removed drawer handler functions - now using full-page view

  const handleExport = () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    window.open(`/api/export-csv?${params.toString()}`)
  }

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-black text-dark mb-6">إدارة الطلبات</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="بحث بالاسم أو رقم الطلب..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-border bg-card text-sm min-h-[48px]"
        >
          <option value="">جميع الحالات</option>
          {Object.entries(REQUEST_STATUSES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <Button variant="outline" onClick={handleExport}>تصدير CSV</Button>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream">
              <tr>
                <th className="px-4 py-3 text-right font-bold">#</th>
                <th className="px-4 py-3 text-right font-bold">العنوان والمحتوى</th>
                <th className="px-4 py-3 text-right font-bold">العميل</th>
                <th className="px-4 py-3 text-right font-bold">الفئة</th>
                <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                <th className="px-4 py-3 text-right font-bold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(r => {
                const cat = CATEGORIES.find(c => c.id === r.category)
                return (
                  <tr
                    key={r.id}
                    onClick={() => openRequest(r)}
                    className="border-t border-border hover:bg-cream/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{generateRequestNumber(r.request_number)}</td>

                    {/* العنوان والمحتوى */}
                    <td className="px-3 py-3 max-w-xs">
                      <div className="space-y-1">
                        {r.title && (
                          <div className="font-bold text-dark text-sm leading-tight line-clamp-2">
                            {r.title}
                          </div>
                        )}
                        {r.content && (
                          <div className="text-muted text-xs leading-relaxed">
                            {truncateContent(r.content)}
                          </div>
                        )}
                        {!r.title && !r.content && (
                          <span className="text-muted text-xs">لا يوجد محتوى</span>
                        )}
                      </div>
                    </td>

                    {/* العميل */}
                    <td className="px-3 py-3 client-name text-sm">{fixTextDirection(r.client_name || '')}</td>

                    {/* الفئة */}
                    <td className="px-3 py-3 text-sm">{cat?.icon} {cat?.nameAr}</td>

                    {/* المبلغ */}
                    <td className="px-3 py-3 text-sm">
                      {r.final_total ?? r.admin_quoted_price
                        ? formatNumber(r.final_total ?? r.admin_quoted_price)
                        : <span className="text-muted text-xs">—</span>}
                    </td>

                    {/* الحالة */}
                    <td className="px-3 py-3"><StatusBadge status={r.status} userRole="admin" /></td>

                    {/* التاريخ */}
                    <td className="px-3 py-3 text-muted text-xs">{formatDate(r.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredRequests.length === 0 && (
          <p className="p-8 text-center text-muted">لا توجد طلبات بعد</p>
        )}
      </div>

    </div>
  )
}
