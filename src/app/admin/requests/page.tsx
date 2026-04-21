'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CATEGORIES, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QuoteComposer from '@/components/admin/QuoteComposer'

export default function AdminRequestsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [composingQuote, setComposingQuote] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

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

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const filteredRequests = requests.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        r.client_name?.toLowerCase().includes(q) ||
        r.client_email?.toLowerCase().includes(q) ||
        generateRequestNumber(r.request_number).toLowerCase().includes(q)
      )
    }
    return true
  })

  const openDrawer = (req: any) => {
    setSelectedRequest(req)
    setNewStatus(req.status)
    setAdminNotes(req.admin_notes ?? '')
    setComposingQuote(false)
    setRejecting(false)
    setRejectReason('')
    setDrawerOpen(true)
  }

  const handleReject = async () => {
    if (!selectedRequest) return
    if (rejectReason.trim().length < 5) {
      showToast('اكتب سبب الرفض ليطّلع عليه العميل', 'error')
      return
    }
    setSaving(true)
    const res = await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: selectedRequest.id,
        status: 'rejected',
        adminNotes: rejectReason.trim(),
      }),
    })
    if (res.ok) {
      showToast('تم رفض الطلب وإرسال السبب للعميل')
      setDrawerOpen(false)
      loadData()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل رفض الطلب', 'error')
    }
    setSaving(false)
  }

  const handleUpdateStatus = async (overrideStatus?: string) => {
    if (!selectedRequest) return
    setSaving(true)

    const statusToSend = overrideStatus ?? newStatus
    const res = await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: selectedRequest.id,
        status: statusToSend,
        adminNotes,
      }),
    })

    if (res.ok) {
      showToast('تم تحديث الحالة بنجاح')
      setDrawerOpen(false)
      loadData()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل تحديث الحالة', 'error')
    }
    setSaving(false)
  }

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
                <th className="px-4 py-3 text-right font-bold">الاسم</th>
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
                    onClick={() => openDrawer(r)}
                    className="border-t border-border hover:bg-cream/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{generateRequestNumber(r.request_number)}</td>
                    <td className="px-4 py-3">{r.client_name}</td>
                    <td className="px-4 py-3">{cat?.icon} {cat?.nameAr}</td>
                    <td className="px-4 py-3">
                      {r.final_total ?? r.admin_quoted_price
                        ? formatNumber(r.final_total ?? r.admin_quoted_price)
                        : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-muted">{formatDate(r.created_at)}</td>
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

      {/* Request Drawer */}
      {drawerOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex md:justify-end">
          <div className="absolute inset-0 bg-dark/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative bg-card w-full md:w-[520px] h-[100dvh] flex flex-col shadow-2xl">
            <div className="flex-shrink-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
              <h2 className="font-bold text-dark text-base">
                طلب {generateRequestNumber(selectedRequest.request_number)}
              </h2>
              <button onClick={() => setDrawerOpen(false)}
                className="w-10 h-10 -ml-2 flex items-center justify-center text-muted hover:text-dark text-xl cursor-pointer">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
              <div className="space-y-2 text-sm">
                <h3 className="font-bold text-dark">بيانات العميل</h3>
                <p>الاسم: {selectedRequest.client_name}</p>
                <p>البريد: <span dir="ltr">{selectedRequest.client_email}</span></p>
                <p>الجوال: <span dir="ltr">{selectedRequest.client_phone}</span></p>
                {selectedRequest.client_city && <p>المدينة: {selectedRequest.client_city}</p>}
              </div>

              <div className="space-y-2 text-sm">
                <h3 className="font-bold text-dark">المحتوى</h3>
                <p className="font-medium">{selectedRequest.title}</p>
                <p className="bg-cream rounded-xl p-3 text-xs whitespace-pre-line">{selectedRequest.content}</p>
                {Array.isArray(selectedRequest.content_images) && selectedRequest.content_images.length > 0 && (
                  <div>
                    <span className="text-muted text-xs block mb-2">الصور المرفقة ({selectedRequest.content_images.length}):</span>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedRequest.content_images.map((url: string, i: number) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="aspect-square rounded-lg overflow-hidden border border-border hover:border-green/40 transition-colors block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(selectedRequest.channels) && selectedRequest.channels.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-muted text-xs">القنوات المختارة:</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedRequest.channels.map((c: string) => (
                        <span key={c} className="px-2 py-0.5 rounded-full bg-green/10 text-green text-xs font-medium">
                          {({ x: 'X', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok' } as Record<string, string>)[c] ?? c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedRequest.status !== 'pending' && selectedRequest.admin_quoted_price != null && (
                <div className="bg-cream rounded-xl p-4 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted">السعر المعتمد:</span>
                    <span className="font-bold text-gold">{formatNumber(selectedRequest.admin_quoted_price)} ر.س</span>
                  </div>
                  {selectedRequest.extras_selected_total > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">خدمات إضافية:</span>
                      <span>+{formatNumber(selectedRequest.extras_selected_total)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-border pt-2 mt-2">
                    <span>الإجمالي:</span>
                    <span className="text-gold text-lg">{formatNumber(selectedRequest.final_total ?? selectedRequest.admin_quoted_price)} ر.س</span>
                  </div>
                </div>
              )}

              {selectedRequest.receipt_url && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const { data } = await supabase.storage.from('receipts').createSignedUrl(selectedRequest.receipt_url, 60)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                >
                  عرض الإيصال
                </Button>
              )}

              <div className="space-y-3 pt-4 border-t border-border">
                {selectedRequest.status === 'pending' ? (
                  composingQuote ? (
                    <QuoteComposer
                      request={selectedRequest}
                      onSent={() => { setDrawerOpen(false); loadData() }}
                      onCancel={() => setComposingQuote(false)}
                    />
                  ) : rejecting ? (
                    <div className="space-y-3">
                      <h3 className="font-bold text-dark">رفض الطلب</h3>
                      <p className="text-xs text-muted">اشرح للعميل سبب الرفض — سيظهر في صفحة طلبه.</p>
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        autoFocus
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[120px] resize-y"
                        placeholder="مثلاً: المحتوى لا يلتزم بسياسة المنصة..."
                      />
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => { setRejecting(false); setRejectReason('') }} className="flex-1">
                          إلغاء
                        </Button>
                        <Button onClick={handleReject} loading={saving} disabled={!rejectReason.trim()} className="flex-1">
                          تأكيد الرفض
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="font-bold text-dark">إجراءات الطلب</h3>
                      <p className="text-xs text-muted">راجع المحتوى ثم أرسل التسعيرة للعميل، أو ارفض الطلب.</p>
                      <Button onClick={() => setComposingQuote(true)} className="w-full">
                        📤 إرسال التسعيرة للعميل
                      </Button>
                      <Button variant="outline" onClick={() => setRejecting(true)} className="w-full">
                        رفض الطلب
                      </Button>
                    </div>
                  )
                ) : (
                  <>
                    {/* Quick action when a receipt is awaiting verification */}
                    {selectedRequest.receipt_url && ['approved', 'payment_review'].includes(selectedRequest.status) && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                        <p className="text-sm font-bold text-orange-700">📎 إيصال تحويل بانتظار التحقق</p>
                        <p className="text-xs text-orange-600">راجع الإيصال أعلاه ثم اضغط لتأكيد استلام الدفع.</p>
                        <Button onClick={() => handleUpdateStatus('paid')}
                          loading={saving} className="w-full">
                          ✓ تأكيد استلام الدفع
                        </Button>
                      </div>
                    )}

                    <h3 className="font-bold text-dark">تحديث الحالة</h3>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[48px]"
                    >
                      {Object.entries(REQUEST_STATUSES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <div>
                      <label className="text-sm font-medium text-dark block mb-1">ملاحظات الإدارة</label>
                      <textarea
                        value={adminNotes}
                        onChange={e => setAdminNotes(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[100px] resize-y"
                        placeholder="أضف ملاحظة..."
                      />
                    </div>
                    <Button onClick={() => handleUpdateStatus()} loading={saving} className="w-full">
                      حفظ وإرسال إشعار للعميل
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
