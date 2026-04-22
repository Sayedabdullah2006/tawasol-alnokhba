'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CATEGORIES, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import { fixTextDirection } from '@/lib/text-utils'
import { useToast } from '@/components/ui/Toast'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import ClientName from '@/components/ui/ClientName'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QuoteComposer from '@/components/admin/QuoteComposer'
import ContentSender from '@/components/admin/ContentSender'
import { getAdminActions, requiresAdminAction, waitingForClient, isFinalStatus, messageColors } from '@/lib/admin-actions'

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
  const [sendingContent, setSendingContent] = useState(false)
  const [respondingToNegotiation, setRespondingToNegotiation] = useState(false)
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [negotiationNotes, setNegotiationNotes] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)

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

  const handleAcceptClientPrice = async () => {
    if (!request?.client_proposed_price) return
    setSaving(true)

    const res = await fetch('/api/send-negotiated-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        newPrice: request.client_proposed_price,
        acceptClientPrice: true,
        adminNotes: negotiationNotes.trim() || null
      })
    })

    if (res.ok) {
      showToast('تم قبول السعر المقترح وإرسال إشعار للعميل')
      router.push('/admin/requests')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل قبول السعر المقترح', 'error')
    }
    setSaving(false)
  }

  const handleApplyDiscount = async () => {
    if (!request || !discountPercentage.trim()) {
      showToast('يرجى إدخال نسبة الخصم', 'error')
      return
    }

    const discount = parseFloat(discountPercentage)
    if (isNaN(discount) || discount < 0 || discount > 100) {
      showToast('يرجى إدخال نسبة خصم صالحة (0-100)', 'error')
      return
    }

    const originalPrice = request.admin_quoted_price || 0
    const discountAmount = (originalPrice * discount) / 100
    const newPrice = originalPrice - discountAmount

    setSaving(true)

    const res = await fetch('/api/send-negotiated-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        newPrice,
        discountPercentage: discount,
        acceptClientPrice: false,
        adminNotes: negotiationNotes.trim() || null
      })
    })

    if (res.ok) {
      showToast('تم إرسال العرض المعدل للعميل')
      router.push('/admin/requests')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل إرسال العرض المعدل', 'error')
    }
    setSaving(false)
  }

  const handleDeleteRequest = async () => {
    if (!request) return

    setDeleting(true)
    try {
      const response = await fetch('/api/admin/delete-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        showToast(`تم حذف طلب ${generateRequestNumber(request.request_number)} نهائياً`, 'success')
        // الانتقال إلى قائمة الطلبات
        router.push('/admin/requests')
      } else {
        showToast(data.error || 'فشل في حذف الطلب', 'error')
      }
    } catch (error) {
      console.error('Delete request error:', error)
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleSendReminder = async () => {
    if (!request) return

    setSendingReminder(true)
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
      setSendingReminder(false)
    }
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
            <StatusBadge status={request.status} userRole="admin" showDescription />
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
                  <ClientName
                    name={request.client_name || ''}
                    className="font-medium"
                  />
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
                <h2 className="font-bold text-dark mb-4">معلومات العرض</h2>
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

              {(() => {
                const adminActions = getAdminActions(request.status as any)

                return (
                  <>
                    {/* Status Message */}
                    <div className={`rounded-xl p-4 mb-4 border ${messageColors[adminActions.message.type]}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{adminActions.message.icon}</span>
                        <p className="text-sm font-medium">{adminActions.message.text}</p>
                      </div>
                    </div>
                  </>
                )
              })()}

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
                    <p className="text-xs text-muted">راجع المحتوى ثم أرسل العرض للعميل، أو ارفض الطلب.</p>
                    <Button onClick={() => setComposingQuote(true)} className="w-full">
                      📤 إرسال العرض للعميل
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

                  {/* Content sending for in_progress status */}
                  {request.status === 'in_progress' && !sendingContent && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                      <h4 className="font-bold text-blue-700">📝 إرسال المحتوى للمراجعة</h4>
                      <p className="text-sm text-blue-600">
                        أرسل النص والتصميم المقترح للعميل للمراجعة والموافقة
                      </p>
                      <Button onClick={() => setSendingContent(true)} className="w-full">
                        📤 إرسال المحتوى للعميل
                      </Button>
                    </div>
                  )}

                  {/* Content sender component */}
                  {sendingContent && request.status === 'in_progress' && (
                    <ContentSender
                      request={request}
                      onSent={() => {
                        setSendingContent(false)
                        // Reload the request to get updated data
                        window.location.reload()
                      }}
                      onCancel={() => setSendingContent(false)}
                    />
                  )}

                  {/* Negotiation Response */}
                  {request.status === 'negotiation' && !respondingToNegotiation && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
                      <h4 className="font-bold text-orange-700">💬 طلب تفاوض من العميل</h4>
                      <div className="space-y-2 text-sm">
                        <div className="bg-white rounded-lg p-3">
                          <h5 className="font-medium text-orange-700 mb-1">رسالة العميل:</h5>
                          <p className="text-orange-600 whitespace-pre-line">{request.negotiation_reason}</p>
                        </div>
                        {request.client_proposed_price && (
                          <div className="bg-white rounded-lg p-3">
                            <h5 className="font-medium text-orange-700 mb-1">السعر المقترح من العميل:</h5>
                            <p className="text-orange-600 font-bold text-lg">{formatNumber(request.client_proposed_price)} ر.س</p>
                            <p className="text-xs text-orange-500 mt-1">
                              (السعر الأصلي: {formatNumber(request.admin_quoted_price)} ر.س)
                            </p>
                          </div>
                        )}
                      </div>
                      <Button onClick={() => setRespondingToNegotiation(true)} className="w-full">
                        🤝 الرد على طلب التفاوض
                      </Button>
                    </div>
                  )}

                  {/* Negotiation Response Form */}
                  {request.status === 'negotiation' && respondingToNegotiation && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-orange-700">🤝 الرد على طلب التفاوض</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRespondingToNegotiation(false)
                            setDiscountPercentage('')
                            setNegotiationNotes('')
                          }}
                          className="text-orange-600 hover:bg-orange-100"
                        >
                          إلغاء
                        </Button>
                      </div>

                      {/* Show client's request details */}
                      <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-orange-700">رسالة العميل: </span>
                          <span className="text-orange-600">{request.negotiation_reason}</span>
                        </div>
                        {request.client_proposed_price && (
                          <div>
                            <span className="font-medium text-orange-700">السعر المقترح: </span>
                            <span className="text-orange-600 font-bold">{formatNumber(request.client_proposed_price)} ر.س</span>
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-orange-700">السعر الأصلي: </span>
                          <span className="text-orange-600">{formatNumber(request.admin_quoted_price)} ر.س</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {/* Option 1: Accept client's proposed price */}
                        {request.client_proposed_price && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h5 className="font-bold text-green-700 mb-2">✅ الخيار الأول: قبول السعر المقترح</h5>
                            <p className="text-sm text-green-600 mb-3">
                              سيتم قبول السعر الذي اقترحه العميل: <strong>{formatNumber(request.client_proposed_price)} ر.س</strong>
                            </p>
                            <Button onClick={handleAcceptClientPrice} loading={saving} className="w-full bg-green-600 hover:bg-green-700">
                              قبول السعر المقترح
                            </Button>
                          </div>
                        )}

                        {/* Option 2: Apply discount percentage */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h5 className="font-bold text-blue-700 mb-2">🏷️ الخيار الثاني: تطبيق نسبة خصم</h5>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-blue-700 mb-1">
                                نسبة الخصم (%) <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                value={discountPercentage}
                                onChange={e => setDiscountPercentage(e.target.value)}
                                min="0"
                                max="100"
                                step="1"
                                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                                placeholder="مثلاً: 20"
                              />
                              {discountPercentage && !isNaN(parseFloat(discountPercentage)) && (
                                <p className="text-xs text-blue-600 mt-1">
                                  السعر الجديد سيكون: <strong>{formatNumber((request.admin_quoted_price || 0) * (1 - parseFloat(discountPercentage) / 100))} ر.س</strong>
                                </p>
                              )}
                            </div>
                            <Button
                              onClick={handleApplyDiscount}
                              loading={saving}
                              disabled={!discountPercentage.trim()}
                              className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                              تطبيق الخصم وإرسال العرض
                            </Button>
                          </div>
                        </div>

                        {/* Optional notes */}
                        <div>
                          <label className="block text-sm font-medium text-orange-700 mb-1">
                            رسالة للعميل (اختيارية)
                          </label>
                          <textarea
                            value={negotiationNotes}
                            onChange={e => setNegotiationNotes(e.target.value)}
                            className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm min-h-[80px] resize-y"
                            placeholder="رسالة توضيحية للعميل..."
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show content review status */}
                  {request.status === 'content_review' && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <h4 className="font-bold text-purple-700 mb-2">👁️ في انتظار مراجعة العميل</h4>
                      <p className="text-sm text-purple-600 mb-3">
                        تم إرسال المحتوى للعميل. سيتم إشعارك عند الموافقة أو طلب التعديلات.
                      </p>
                      {request.proposed_content && (
                        <div className="bg-white rounded-lg p-3 mt-3">
                          <h5 className="font-medium text-purple-700 mb-1">المحتوى المرسل:</h5>
                          <p className="text-sm text-purple-600 whitespace-pre-line">{request.proposed_content}</p>
                        </div>
                      )}
                      {request.user_feedback && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                          <h5 className="font-medium text-yellow-700 mb-1">ملاحظات العميل:</h5>
                          <p className="text-sm text-yellow-600 whitespace-pre-line">{request.user_feedback}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Conditional Admin Controls */}
                  {(() => {
                    const adminActions = getAdminActions(request.status as any)

                    return (
                      <>
                        {adminActions.showStatusUpdate && (
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
                        )}

                        {adminActions.showAdminNotes && (
                          <div>
                            <label className="text-sm font-medium text-dark block mb-2">ملاحظات الإدارة</label>
                            <textarea
                              value={adminNotes}
                              onChange={e => setAdminNotes(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[100px] resize-y"
                              placeholder="أضف ملاحظة..."
                            />
                          </div>
                        )}

                        {(adminActions.showStatusUpdate || adminActions.showAdminNotes) && (
                          <Button onClick={() => handleUpdateStatus()} loading={saving} className="w-full">
                            حفظ وإرسال إشعار للعميل
                          </Button>
                        )}

                        {/* No actions needed message for waiting states */}
                        {waitingForClient(request.status as any) && (
                          <div className="text-center py-6">
                            <div className="inline-flex items-center gap-2 text-muted">
                              <span className="text-lg">⏳</span>
                              <span className="text-sm">لا توجد إجراءات مطلوبة حالياً</span>
                            </div>
                          </div>
                        )}

                        {/* Final status message */}
                        {isFinalStatus(request.status as any) && (
                          <div className="text-center py-6">
                            <div className="inline-flex items-center gap-2 text-muted">
                              <span className="text-lg">{request.status === 'completed' ? '🎉' : '📋'}</span>
                              <span className="text-sm">طلب منتهي - أرشفة تلقائية</span>
                            </div>
                          </div>
                        )}

                        {/* Admin Actions - Always available */}
                        <div className="border-t border-border pt-4 mt-4 space-y-3">
                          {/* Send Reminder Button */}
                          <Button
                            variant="outline"
                            onClick={handleSendReminder}
                            className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                            disabled={sendingReminder || !request.client_email}
                            loading={sendingReminder}
                          >
                            📧 إرسال تذكير للعميل
                          </Button>

                          {/* Delete Button */}
                          <Button
                            variant="outline"
                            onClick={() => setShowDeleteDialog(true)}
                            className="w-full border-red-300 text-red-700 hover:bg-red-50"
                            disabled={deleting}
                          >
                            🗑️ حذف الطلب نهائياً
                          </Button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-700 mb-2">تأكيد حذف الطلب</h3>
              <p className="text-sm text-gray-600">
                هل أنت متأكد من حذف طلب <strong>{generateRequestNumber(request.request_number)}</strong>؟
              </p>
              <div className="mt-4 p-4 bg-gray-50 rounded-xl text-right">
                <div className="text-sm font-bold text-gray-700 mb-1">تفاصيل الطلب:</div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div><strong>العميل:</strong> <ClientName name={request.client_name || ''} className="inline" /></div>
                  {request.title && <div><strong>العنوان:</strong> {request.title}</div>}
                  <div><strong>الحالة:</strong> <StatusBadge status={request.status} userRole="admin" /></div>
                  {(request.final_total || request.admin_quoted_price) && (
                    <div><strong>المبلغ:</strong> {formatNumber(request.final_total || request.admin_quoted_price)} ر.س</div>
                  )}
                </div>
              </div>
              <p className="text-xs text-red-600 mt-4 font-bold">
                ⚠️ هذا الإجراء لا يمكن التراجع عنه!
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1"
                disabled={deleting}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleDeleteRequest}
                loading={deleting}
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