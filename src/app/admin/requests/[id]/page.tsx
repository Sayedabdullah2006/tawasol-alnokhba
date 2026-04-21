'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CATEGORIES, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QuoteComposer from '@/components/admin/QuoteComposer'

export default function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState<any>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [composingQuote, setComposingQuote] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    const loadData = async () => {
      // Check if user is admin
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      // Load request details
      const { data: req } = await supabase
        .from('publish_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (!req) {
        router.push('/admin/requests')
        return
      }

      setRequest(req)
      setNewStatus(req.status)
      setAdminNotes(req.admin_notes ?? '')
      setLoading(false)
    }

    loadData()
  }, [id, supabase, router])

  const handleReject = async () => {
    if (!request) return
    if (rejectReason.trim().length < 5) {
      showToast('اكتب سبب الرفض ليطّلع عليه العميل', 'error')
      return
    }
    setSaving(true)
    const res = await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        status: 'rejected',
        adminNotes: rejectReason.trim(),
      }),
    })
    if (res.ok) {
      showToast('تم رفض الطلب وإرسال السبب للعميل')
      router.push('/admin/requests')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل رفض الطلب', 'error')
    }
    setSaving(false)
  }

  const handleUpdateStatus = async (overrideStatus?: string) => {
    if (!request) return
    setSaving(true)

    const statusToSend = overrideStatus ?? newStatus
    const res = await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        status: statusToSend,
        adminNotes,
      }),
    })

    if (res.ok) {
      showToast('تم تحديث الحالة بنجاح')
      // Reload the request to get updated data
      const { data: updatedReq } = await supabase
        .from('publish_requests')
        .select('*')
        .eq('id', id)
        .single()
      if (updatedReq) {
        setRequest(updatedReq)
        setNewStatus(updatedReq.status)
        setAdminNotes(updatedReq.admin_notes ?? '')
      }
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل تحديث الحالة', 'error')
    }
    setSaving(false)
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (!request) return null

  const cat = CATEGORIES.find(c => c.id === request.category)

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-2 text-green hover:underline mb-4"
          >
            ← العودة للطلبات
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-dark">
                طلب {generateRequestNumber(request.request_number)}
              </h1>
              <p className="text-muted">{formatDate(request.created_at)}</p>
            </div>
            <StatusBadge status={request.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Client Info */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="font-bold text-dark mb-4">بيانات العميل</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted block">الاسم</span>
                  <span className="font-medium">{request.client_name}</span>
                </div>
                <div>
                  <span className="text-muted block">البريد</span>
                  <span className="font-medium" dir="ltr">{request.client_email}</span>
                </div>
                <div>
                  <span className="text-muted block">الجوال</span>
                  <span className="font-medium" dir="ltr">{request.client_phone}</span>
                </div>
                {request.client_city && (
                  <div>
                    <span className="text-muted block">المدينة</span>
                    <span className="font-medium">{request.client_city}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content Details */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="font-bold text-dark mb-4">تفاصيل المحتوى</h2>

              <div className="space-y-4">
                <div>
                  <span className="text-muted text-sm block mb-1">الفئة</span>
                  <span className="font-medium">{cat?.icon} {cat?.nameAr ?? request.category}</span>
                </div>

                <div>
                  <span className="text-muted text-sm block mb-1">عنوان الخبر</span>
                  <p className="font-medium text-dark">{request.title}</p>
                </div>

                <div>
                  <span className="text-muted text-sm block mb-1">المحتوى</span>
                  <p className="text-dark text-sm whitespace-pre-line bg-cream rounded-xl p-3">
                    {request.content}
                  </p>
                </div>

                {Array.isArray(request.content_images) && request.content_images.length > 0 && (
                  <div>
                    <span className="text-muted text-sm block mb-2">الصور المرفقة ({request.content_images.length}):</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {request.content_images.map((url: string, i: number) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="aspect-square rounded-xl overflow-hidden border border-border hover:border-green/40 transition-colors block">
                          <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(request.channels) && request.channels.length > 0 && (
                  <div>
                    <span className="text-muted text-sm block mb-2">القنوات المختارة:</span>
                    <div className="flex flex-wrap gap-2">
                      {request.channels.map((c: string) => (
                        <span key={c} className="px-3 py-1 rounded-full bg-green/10 text-green text-sm font-medium">
                          {({ x: 'X', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok' } as Record<string, string>)[c] ?? c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing Info */}
            {request.status !== 'pending' && request.admin_quoted_price != null && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-bold text-dark mb-4">معلومات التسعيرة</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">السعر المعتمد:</span>
                    <span className="font-bold text-gold">{formatNumber(request.admin_quoted_price)} ر.س</span>
                  </div>
                  {request.extras_selected_total > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">خدمات إضافية:</span>
                      <span>+{formatNumber(request.extras_selected_total)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-border pt-2 mt-2">
                    <span>الإجمالي:</span>
                    <span className="text-gold text-lg">{formatNumber(request.final_total ?? request.admin_quoted_price)} ر.س</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-6">
            {/* Receipt */}
            {request.receipt_url && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h3 className="font-bold text-dark mb-3">إيصال الدفع</h3>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const { data } = await supabase.storage.from('receipts').createSignedUrl(request.receipt_url, 60)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  className="w-full"
                >
                  عرض الإيصال
                </Button>
              </div>
            )}

            {/* Actions */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="font-bold text-dark mb-4">إجراءات الطلب</h3>

              {request.status === 'pending' ? (
                composingQuote ? (
                  <QuoteComposer
                    request={request}
                    onSent={() => router.push('/admin/requests')}
                    onCancel={() => setComposingQuote(false)}
                  />
                ) : rejecting ? (
                  <div className="space-y-3">
                    <h4 className="font-bold text-dark">رفض الطلب</h4>
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
                  <div className="space-y-3">
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
                <div className="space-y-4">
                  {/* Quick payment confirmation */}
                  {request.receipt_url && ['approved', 'payment_review'].includes(request.status) && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-bold text-orange-700">📎 إيصال تحويل بانتظار التحقق</p>
                      <Button onClick={() => handleUpdateStatus('paid')}
                        loading={saving} className="w-full">
                        ✓ تأكيد استلام الدفع
                      </Button>
                    </div>
                  )}

                  {/* Status Update */}
                  <div>
                    <label className="text-sm font-medium text-dark block mb-2">تحديث الحالة</label>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[48px] mb-3"
                    >
                      {Object.entries(REQUEST_STATUSES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-dark block mb-2">ملاحظات الإدارة</label>
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}