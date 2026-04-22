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
import { useToast } from '@/components/ui/Toast'

export default function AdminRequestsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [requestToDelete, setRequestToDelete] = useState<any>(null)
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

  const handleDeleteClick = (request: any, event: React.MouseEvent) => {
    event.stopPropagation() // منع فتح صفحة الطلب
    setRequestToDelete(request)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    if (!requestToDelete) return

    setDeletingRequestId(requestToDelete.id)
    try {
      const response = await fetch('/api/admin/delete-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: requestToDelete.id })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        showToast(`تم حذف طلب ${generateRequestNumber(requestToDelete.request_number)} نهائياً`, 'success')
        // إزالة الطلب من القائمة
        setRequests(prev => prev.filter(r => r.id !== requestToDelete.id))
      } else {
        showToast(data.error || 'فشل في حذف الطلب', 'error')
      }
    } catch (error) {
      console.error('Delete request error:', error)
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setDeletingRequestId(null)
      setShowDeleteDialog(false)
      setRequestToDelete(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false)
    setRequestToDelete(null)
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
                <th className="px-4 py-3 text-center font-bold">إجراءات</th>
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

                    {/* إجراءات */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={(e) => handleDeleteClick(r, e)}
                        disabled={deletingRequestId === r.id}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="حذف الطلب نهائياً"
                      >
                        {deletingRequestId === r.id ? (
                          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <span className="text-sm">🗑️</span>
                        )}
                      </button>
                    </td>
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

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && requestToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-700 mb-2">تأكيد حذف الطلب</h3>
              <p className="text-sm text-gray-600">
                هل أنت متأكد من حذف طلب <strong>{generateRequestNumber(requestToDelete.request_number)}</strong>؟
              </p>
              <div className="mt-4 p-4 bg-gray-50 rounded-xl text-right">
                <div className="text-sm font-bold text-gray-700 mb-1">تفاصيل الطلب:</div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div><strong>العميل:</strong> {requestToDelete.client_name}</div>
                  {requestToDelete.title && <div><strong>العنوان:</strong> {requestToDelete.title}</div>}
                  <div><strong>الحالة:</strong> <StatusBadge status={requestToDelete.status} userRole="admin" /></div>
                </div>
              </div>
              <p className="text-xs text-red-600 mt-4 font-bold">
                ⚠️ هذا الإجراء لا يمكن التراجع عنه!
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                className="flex-1"
                disabled={deletingRequestId === requestToDelete.id}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleDeleteConfirm}
                loading={deletingRequestId === requestToDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                حذف نهائياً
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
