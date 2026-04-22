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
import ClientNameFixed from '@/components/ui/ClientNameFixed'
import NameDisplayTest from '@/components/debug/NameDisplayTest'

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
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
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
    console.log('🗑️ Delete clicked for request:', request.id, request.client_name)
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

  const handleSendReminder = async (request: any, event: React.MouseEvent) => {
    event.stopPropagation() // منع فتح صفحة الطلب
    console.log('🔔 Sending reminder for request:', request.id, request.client_email)

    setSendingReminderId(request.id)
    try {
      const response = await fetch('/api/admin/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          reminderType: request.status // استخدام حالة الطلب كنوع التذكير
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        showToast(`تم إرسال تذكير لطلب ${generateRequestNumber(request.request_number)} بنجاح`, 'success')
      } else {
        showToast(data.error || 'فشل في إرسال التذكير', 'error')
      }
    } catch (error) {
      console.error('Send reminder error:', error)
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSendingReminderId(null)
    }
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

        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
        >
          {showDebug ? 'إخفاء' : 'إظهار'} التشخيص
        </button>

        {/* Debug Info */}
        <div className="ml-auto text-xs text-muted">
          عدد الطلبات: {requests.length} | المفلترة: {filteredRequests.length}
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <h3 className="font-bold text-yellow-700 mb-2">🔍 معلومات التشخيص</h3>
            <div className="text-xs text-yellow-600 space-y-1">
              <div>إجمالي الطلبات: {requests.length}</div>
              <div>الطلبات المفلترة: {filteredRequests.length}</div>
              <div>حالة البحث: "{search || 'فارغ'}"</div>
              <div>فلتر الحالة: "{statusFilter || 'جميع الحالات'}"</div>
              {filteredRequests.length > 0 && (
                <div>عينة من البيانات: {JSON.stringify({
                  id: filteredRequests[0]?.id?.substring(0, 8),
                  client_email: filteredRequests[0]?.client_email ? 'موجود' : 'مفقود',
                  status: filteredRequests[0]?.status
                })}</div>
              )}
            </div>
          </div>

          {/* Name Display Test */}
          {filteredRequests.length > 0 && (
            <NameDisplayTest
              names={filteredRequests
                .slice(0, 3)
                .map(r => r.client_name)
                .filter(Boolean)}
            />
          )}
        </>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-cream">
              <tr>
                <th className="px-4 py-3 text-right font-bold w-20">#</th>
                <th className="px-4 py-3 text-right font-bold">العنوان والمحتوى</th>
                <th className="px-4 py-3 text-right font-bold w-32">العميل</th>
                <th className="px-4 py-3 text-right font-bold w-24">الفئة</th>
                <th className="px-4 py-3 text-right font-bold w-24">المبلغ</th>
                <th className="px-4 py-3 text-right font-bold w-28">الحالة</th>
                <th className="px-4 py-3 text-right font-bold w-20">التاريخ</th>
                <th className="px-4 py-3 text-center font-bold w-32 min-w-[120px]">إجراءات</th>
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
                    <td className="px-3 py-3 text-sm">
                      <ClientNameFixed
                        name={r.client_name || ''}
                        maxLength={20}
                        className="font-medium"
                      />
                    </td>

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
                    <td className="px-3 py-3 text-center min-w-[120px]">
                      <div className="flex items-center justify-center gap-1">
                        {/* زر التذكير */}
                        <button
                          onClick={(e) => handleSendReminder(r, e)}
                          disabled={sendingReminderId === r.id || !r.client_email}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          title={!r.client_email ? "لا يوجد إيميل للعميل" : "إرسال تذكير للعميل"}
                        >
                          {sendingReminderId === r.id ? (
                            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <span className="text-xs">📧</span>
                          )}
                        </button>

                        {/* زر الحذف */}
                        <button
                          onClick={(e) => handleDeleteClick(r, e)}
                          disabled={deletingRequestId === r.id}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          title="حذف الطلب نهائياً"
                        >
                          {deletingRequestId === r.id ? (
                            <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <span className="text-xs">🗑️</span>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredRequests.length === 0 && (
          <div className="p-8 text-center text-muted">
            <p>لا توجد طلبات {search || statusFilter ? 'تطابق البحث' : 'بعد'}</p>
            {(search || statusFilter) && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); }}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                إظهار جميع الطلبات
              </button>
            )}
          </div>
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
