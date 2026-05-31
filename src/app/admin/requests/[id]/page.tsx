'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CATEGORIES, EXTRAS, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import { fixTextDirection } from '@/lib/text-utils'
import { useToast } from '@/components/ui/Toast'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import ClientName from '@/components/ui/ClientName'
import ContentDebugger from '@/components/debug/ContentDebugger'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QuoteComposer from '@/components/admin/QuoteComposer'
import ContentSender from '@/components/admin/ContentSender'
import { getAdminActions, requiresAdminAction, waitingForClient, isFinalStatus, messageColors } from '@/lib/admin-actions'

// ── مساعدات عرض البيانات ───────────────────────────────────────────

const CAMPAIGN_DURATION_LABELS: Record<string, string> = {
  week_1:  'أسبوع واحد',
  week_2:  'أسبوعان',
  month_1: 'شهر واحد',
  month_2: 'شهران',
  month_3: '3 أشهر',
  month_6: '6 أشهر',
  open:    'مفتوح (بدون تحديد)',
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  individual: '👤 فرد',
  business:   '🏢 شركة / مؤسسة تجارية',
  government: '🏛️ جهة حكومية',
  charity:    '❤️ مؤسسة خيرية',
  agency:     '📣 وكالة دعاية وإعلان',
}

const CHANNEL_LABELS: Record<string, string> = {
  x: 'X (تويتر)', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok',
}

const COMPETITION_SUBCAT_LABELS: Record<string, string> = {
  international: 'مسابقات دولية',
  local:         'مسابقات محلية',
  hackathon:     'هاكثون / تحدٍّ برمجي',
}

const COMPETITION_POS_LABELS: Record<string, string> = {
  first:        'المركز الأول 🥇',
  second:       'المركز الثاني 🥈',
  third:        'المركز الثالث 🥉',
  top_10:       'ضمن أفضل 10',
  top_50:       'ضمن أفضل 50',
  participation:'مشاركة',
  finalist:     'وصلت للنهائي',
}

const INVENTION_LABELS: Record<string, string> = {
  with_patent: 'ببراءة اختراع 📜',
  no_patent:   'بدون براءة اختراع',
}

const EXTRAS_MAP = Object.fromEntries(EXTRAS.map(e => [e.id, e]))

function parseSubOption(raw: string | null | undefined): { subcategory?: string; position?: string } | string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed
    return parsed
  } catch {
    return raw
  }
}

function renderSubOptionLabel(category: string, raw: string | null | undefined): string | null {
  const parsed = parseSubOption(raw)
  if (!parsed) return null
  if (category === 'competitions' && typeof parsed === 'object') {
    const sub = (parsed as any).subcategory
    const pos = (parsed as any).position
    return `${COMPETITION_SUBCAT_LABELS[sub] ?? sub} — ${COMPETITION_POS_LABELS[pos] ?? pos}`
  }
  if (category === 'inventions' && typeof parsed === 'string') {
    return INVENTION_LABELS[parsed] ?? parsed
  }
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      const { data: req } = await supabase
        .from('publish_requests')
        .select('*, influencer:influencers(name_ar, name_en)')
        .eq('id', id)
        .single()

      if (!req) { router.push('/admin/requests'); return }

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
      body: JSON.stringify({ requestId: request.id, status: 'rejected', adminNotes: rejectReason.trim() }),
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
      body: JSON.stringify({ requestId: request.id, status: statusToSend, adminNotes }),
    })
    if (res.ok) {
      showToast('تم تحديث الحالة بنجاح')
      const { data: updatedReq } = await supabase
        .from('publish_requests')
        .select('*, influencer:influencers(name_ar, name_en)')
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
      body: JSON.stringify({ requestId: request.id, newPrice: request.client_proposed_price, acceptClientPrice: true, adminNotes: negotiationNotes.trim() || null }),
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

  const handleRejectNegotiation = async () => {
    if (!request) return
    setSaving(true)
    const res = await fetch('/api/send-negotiated-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, rejectNegotiation: true, adminNotes: negotiationNotes.trim() || null }),
    })
    if (res.ok) {
      showToast('تم رفض التفاوض والإبقاء على السعر الأصلي')
      router.push('/admin/requests')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل رفض التفاوض', 'error')
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
    const newPrice = originalPrice - (originalPrice * discount) / 100
    setSaving(true)
    const res = await fetch('/api/send-negotiated-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, newPrice, discountPercentage: discount, acceptClientPrice: false, adminNotes: negotiationNotes.trim() || null }),
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
        body: JSON.stringify({ requestId: request.id }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        showToast(`تم حذف طلب ${generateRequestNumber(request.request_number)} نهائياً`, 'success')
        router.push('/admin/requests')
      } else {
        showToast(data.error || 'فشل في حذف الطلب', 'error')
      }
    } catch {
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
        body: JSON.stringify({ requestId: request.id, reminderType: request.status }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        showToast(`تم إرسال تذكير لطلب ${generateRequestNumber(request.request_number)} بنجاح`, 'success')
      } else {
        showToast(data.error || 'فشل في إرسال التذكير', 'error')
      }
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSendingReminder(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (!request) return null

  const cat = CATEGORIES.find(c => c.id === request.category)
  const selectedExtras: string[] = Array.isArray(request.extras) ? request.extras : []
  const subOptionLabel = renderSubOptionLabel(request.category, request.sub_option)
  const influencerName = request.influencer?.name_ar ?? null

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-5xl mx-auto p-4 md:p-6">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="mb-6">
          <Link href="/admin/requests" className="inline-flex items-center gap-2 text-green hover:underline mb-4">
            ← العودة للطلبات
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-dark">
                طلب {generateRequestNumber(request.request_number)}
              </h1>
              <p className="text-muted text-sm">{formatDate(request.created_at)}</p>
            </div>
            <StatusBadge status={request.status} userRole="admin" showDescription />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Main Content ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* ① بيانات العميل */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="font-bold text-dark mb-4 flex items-center gap-2">
                👤 بيانات العميل
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoRow label="الاسم">
                  <ClientName name={request.client_name || ''} className="font-medium" />
                </InfoRow>
                <InfoRow label="البريد الإلكتروني">
                  <span dir="ltr">{request.client_email}</span>
                </InfoRow>
                <InfoRow label="الجوال">
                  <span dir="ltr">{request.client_phone}</span>
                </InfoRow>
                {request.client_city && (
                  <InfoRow label="المدينة">{request.client_city}</InfoRow>
                )}
                {request.client_type && (
                  <InfoRow label="نوع العميل">
                    <span className="font-medium">{CLIENT_TYPE_LABELS[request.client_type] ?? request.client_type}</span>
                  </InfoRow>
                )}
                {request.org_name && (
                  <InfoRow label="اسم الجهة">
                    <span className="font-medium">{request.org_name}</span>
                  </InfoRow>
                )}
                {request.org_representative && (
                  <InfoRow label="ممثل الجهة">
                    <span className="font-medium">{request.org_representative}</span>
                  </InfoRow>
                )}
                {request.org_license && (
                  <InfoRow label="السجل / الترخيص">
                    <span className="font-medium">{request.org_license}</span>
                  </InfoRow>
                )}
                {request.x_handle && (
                  <InfoRow label="حساب X / تويتر">
                    <a
                      href={`https://x.com/${request.x_handle.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                      dir="ltr"
                    >
                      @{request.x_handle.replace('@', '')}
                    </a>
                  </InfoRow>
                )}
              </div>
            </div>

            {/* ② تفاصيل المنشور */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="font-bold text-dark mb-4 flex items-center gap-2">
                📋 تفاصيل المنشور
              </h2>
              <div className="space-y-4 text-sm">

                {/* المؤثر */}
                {influencerName && (
                  <InfoRow label="المؤثر">
                    <span className="font-bold text-green">{influencerName}</span>
                  </InfoRow>
                )}

                {/* الفئة + الفئة الفرعية */}
                <InfoRow label="الفئة">
                  <span className="font-medium">{cat?.icon} {cat?.nameAr ?? request.category}</span>
                </InfoRow>
                {subOptionLabel && (
                  <InfoRow label="التفاصيل الفرعية">
                    <span className="font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
                      {subOptionLabel}
                    </span>
                  </InfoRow>
                )}

                {/* القنوات */}
                {Array.isArray(request.channels) && request.channels.length > 0 && (
                  <div>
                    <span className="text-muted block mb-1.5">القنوات المختارة</span>
                    <div className="flex flex-wrap gap-2">
                      {request.channels.map((c: string) => (
                        <span key={c} className="px-3 py-1 rounded-full bg-green/10 text-green text-xs font-semibold">
                          {CHANNEL_LABELS[c] ?? c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* عنوان الخبر */}
                <InfoRow label="عنوان الخبر">
                  <p className="font-semibold text-dark">{request.title}</p>
                </InfoRow>

                {/* المحتوى */}
                <div>
                  <span className="text-muted block mb-1.5">نص المحتوى</span>
                  <div className="bg-cream rounded-xl p-4 text-dark text-sm whitespace-pre-line border border-border/50">
                    {request.content}
                  </div>
                </div>

                {/* الرابط */}
                {request.link && (
                  <InfoRow label="رابط مرفق">
                    <a
                      href={request.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                      dir="ltr"
                    >
                      {request.link}
                    </a>
                  </InfoRow>
                )}

                {/* الهاشتاقات */}
                {request.hashtags && (
                  <InfoRow label="الهاشتاقات">
                    <span className="text-blue-600 font-medium" dir="ltr">{request.hashtags}</span>
                  </InfoRow>
                )}

                {/* التاريخ المفضل للنشر */}
                {request.preferred_date && (
                  <InfoRow label="التاريخ المفضل للنشر">
                    <span className="font-medium text-orange-700">
                      📅 {formatDate(request.preferred_date)}
                    </span>
                  </InfoRow>
                )}

                {/* الصور المرفقة */}
                {Array.isArray(request.content_images) && request.content_images.length > 0 && (
                  <div>
                    <span className="text-muted block mb-2">
                      الصور المرفقة ({request.content_images.length})
                    </span>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {request.content_images.map((url: string, i: number) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-xl overflow-hidden border border-border hover:border-green/40 transition-colors block"
                        >
                          <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ② ب — منشورات الحملة */}
            {request.request_type === 'campaign' && Array.isArray(request.campaign_posts) && request.campaign_posts.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-bold text-dark mb-4 flex items-center gap-2">
                  🚀 منشورات الحملة
                  <span className="text-xs bg-green/10 text-green-700 font-bold px-2 py-0.5 rounded-full mr-1">
                    {request.campaign_posts.length} منشور
                  </span>
                  {request.campaign_discount_pct && (
                    <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                      خصم {request.campaign_discount_pct}%
                    </span>
                  )}
                </h2>

                {/* تفاصيل التسعير */}
                {request.campaign_subtotal != null && (
                  <div className="mb-4 bg-green/5 rounded-xl p-3 text-sm flex justify-between">
                    <div>
                      <div className="text-muted line-through">{formatNumber(request.campaign_subtotal)} ر.س</div>
                      <div className="font-black text-green text-lg">{formatNumber(request.base_price)} ر.س</div>
                    </div>
                    <div className="text-left text-xs text-muted self-center">
                      <div>بعد خصم {request.campaign_discount_pct ?? 30}%</div>
                      <div className="text-green font-bold">وفّر {formatNumber(request.campaign_subtotal - (request.base_price ?? 0))} ر.س</div>
                    </div>
                  </div>
                )}

                {/* مدة الحملة */}
                {request.campaign_duration && (
                  <div className="mb-4">
                    <InfoRow label="مدة الحملة">
                      <span className="font-medium">
                        {CAMPAIGN_DURATION_LABELS[request.campaign_duration] ?? request.campaign_duration}
                      </span>
                    </InfoRow>
                  </div>
                )}

                {/* بطاقات المنشورات */}
                <div className="space-y-3">
                  {request.campaign_posts.map((post: Record<string, unknown>, idx: number) => {
                    const pCat = CATEGORIES.find(c => c.id === post.category)
                    let subLabel: string | null = null
                    if (post.sub_option) {
                      subLabel = renderSubOptionLabel(post.category as string, post.sub_option as string)
                    }
                    return (
                      <div key={idx} className="rounded-xl border border-border bg-cream/50 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border/50">
                          <div className="w-7 h-7 rounded-full bg-green/10 text-green text-sm font-black flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-dark text-sm truncate">{post.title as string || '—'}</div>
                            {pCat && (
                              <div className="text-xs text-muted">{pCat.icon} {pCat.nameAr}</div>
                            )}
                          </div>
                          {!!post.preferred_date && (
                            <div className="text-xs text-orange-600 flex-shrink-0">
                              📅 {formatDate(post.preferred_date as string)}
                            </div>
                          )}
                        </div>
                        <div className="p-4 space-y-2 text-sm">
                          {subLabel && (
                            <div className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg inline-block">
                              {subLabel}
                            </div>
                          )}
                          <div className="text-dark whitespace-pre-line bg-cream rounded-lg p-3 border border-border/50">
                            {post.content as string}
                          </div>
                          {!!post.link && (
                            <a href={post.link as string} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs break-all" dir="ltr">
                              {post.link as string}
                            </a>
                          )}
                          {!!post.hashtags && (
                            <div className="text-blue-600 text-xs font-medium" dir="ltr">{post.hashtags as string}</div>
                          )}
                          {Array.isArray(post.images) && (post.images as string[]).length > 0 && (
                            <div className="grid grid-cols-4 gap-1 mt-1">
                              {(post.images as string[]).map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="aspect-square rounded-lg overflow-hidden border border-border block">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ③ الخدمات الإضافية */}
            {selectedExtras.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-bold text-dark mb-4 flex items-center gap-2">
                  ✨ الخدمات الإضافية المختارة
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedExtras.map((id: string) => {
                    const extra = EXTRAS_MAP[id]
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between bg-green/5 rounded-xl px-4 py-3 border border-green/20"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-dark">
                          <span>{extra?.icon ?? '•'}</span>
                          <span>{extra?.nameAr ?? id}</span>
                        </span>
                        <span className="text-sm font-bold text-green">
                          +{formatNumber(extra?.price ?? 0)} ر.س
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ④ معلومات التسعير */}
            {request.admin_quoted_price != null && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-dark flex items-center gap-2">
                    💰 معلومات التسعير
                  </h2>
                  {request.auto_quoted_at && (
                    <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">
                      🤖 تسعير تلقائي
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  {request.request_type === 'campaign' && request.campaign_subtotal != null ? (
                    <>
                      <div className="flex justify-between text-muted">
                        <span>مجموع المنشورات ({request.campaign_post_count})</span>
                        <span>{formatNumber(request.campaign_subtotal)} ر.س</span>
                      </div>
                      <div className="flex justify-between text-green font-semibold">
                        <span>خصم الحملة ({request.campaign_discount_pct ?? 30}%)</span>
                        <span>− {formatNumber(request.campaign_subtotal - (request.base_price ?? 0))} ر.س</span>
                      </div>
                    </>
                  ) : request.base_price != null ? (
                    <div className="flex justify-between text-muted">
                      <span>السعر الأساسي</span>
                      <span>{formatNumber(request.base_price)} ر.س</span>
                    </div>
                  ) : null}
                  {selectedExtras.length > 0 && request.extras_total != null && (
                    <div className="flex justify-between text-muted">
                      <span>الخدمات الإضافية ({selectedExtras.length})</span>
                      <span>+{formatNumber(request.extras_total)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-dark text-lg border-t border-border pt-3 mt-1">
                    <span>الإجمالي</span>
                    <span className="text-gold">
                      {formatNumber(request.final_total ?? request.admin_quoted_price)} ر.س
                    </span>
                  </div>
                  {request.auto_quote_note && (
                    <p className="text-xs text-muted bg-cream rounded-lg p-2 mt-2">
                      📝 {request.auto_quote_note}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ⑤ سجل التفاوض */}
            {(request.negotiation_round > 0 || request.original_quoted_price) && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-bold text-dark mb-4 flex items-center gap-2">
                  🤝 سجل التفاوض
                </h2>
                <div className="space-y-3 text-sm">
                  {request.original_quoted_price != null && (
                    <div className="flex justify-between text-muted">
                      <span>السعر الأصلي</span>
                      <span>{formatNumber(request.original_quoted_price)} ر.س</span>
                    </div>
                  )}
                  {request.negotiation_round > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">الجولات المستخدمة</span>
                      <span className="font-bold">
                        {request.negotiation_round} / 3
                      </span>
                    </div>
                  )}
                  {request.negotiated_discount_percentage > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">الخصم المُمنَح</span>
                      <span className="font-bold text-green">
                        {request.negotiated_discount_percentage}%
                      </span>
                    </div>
                  )}
                  {request.admin_quoted_price != null && request.original_quoted_price != null && (
                    <div className="flex justify-between font-bold border-t border-border pt-2">
                      <span>السعر بعد التفاوض</span>
                      <span className="text-green">
                        {formatNumber(request.admin_quoted_price)} ر.س
                      </span>
                    </div>
                  )}
                  {request.negotiation_reason && (
                    <div className="bg-orange-50 rounded-xl p-3 mt-1">
                      <p className="text-xs text-orange-700 font-medium mb-0.5">سبب التفاوض من العميل:</p>
                      <p className="text-sm text-orange-600">{request.negotiation_reason}</p>
                    </div>
                  )}
                  {request.client_proposed_price && (
                    <InfoRow label="السعر المقترح من العميل">
                      <span className="font-bold">{formatNumber(request.client_proposed_price)} ر.س</span>
                    </InfoRow>
                  )}
                  {request.negotiation_rejected && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
                      🔒 التفاوض مقفل — وصل للحد الأقصى
                    </div>
                  )}
                  {request.negotiated_at && (
                    <p className="text-xs text-muted">آخر تحديث: {formatDate(request.negotiated_at)}</p>
                  )}
                </div>
              </div>
            )}

            {/* ⑥ بيانات الدفع */}
            {request.paid_at && (
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-bold text-dark mb-4 flex items-center gap-2">
                  💳 بيانات الدفع
                </h2>
                <div className="space-y-2 text-sm">
                  <InfoRow label="تاريخ الدفع">
                    <span className="font-medium text-green">{formatDate(request.paid_at)}</span>
                  </InfoRow>
                  {request.payment_method && (
                    <InfoRow label="طريقة الدفع">
                      <span className="font-medium">{request.payment_method}</span>
                    </InfoRow>
                  )}
                  {request.final_total && (
                    <InfoRow label="المبلغ المدفوع">
                      <span className="font-bold text-green">{formatNumber(request.final_total)} ر.س</span>
                    </InfoRow>
                  )}
                  {request.moyasar_payment_id && (
                    <InfoRow label="معرّف Moyasar">
                      <span dir="ltr" className="font-mono text-xs text-muted">{request.moyasar_payment_id}</span>
                    </InfoRow>
                  )}
                  {request.tamara_order_id && (
                    <InfoRow label="معرّف Tamara">
                      <span dir="ltr" className="font-mono text-xs text-muted">{request.tamara_order_id}</span>
                    </InfoRow>
                  )}
                </div>
              </div>
            )}

            {/* ⑦ ملاحظات الإدارة */}
            {request.admin_notes && (
              <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-5">
                <h2 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
                  📝 ملاحظات الإدارة
                </h2>
                <p className="text-sm text-yellow-700 whitespace-pre-line">{request.admin_notes}</p>
              </div>
            )}
          </div>

          {/* ── Actions Sidebar ──────────────────────────────────────── */}
          <div className="space-y-5">

            {/* إيصال الدفع */}
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

            {/* إجراءات الطلب */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="font-bold text-dark mb-4">إجراءات الطلب</h3>

              {(() => {
                const adminActions = getAdminActions(request.status as any)
                return (
                  <div className={`rounded-xl p-4 mb-4 border ${messageColors[adminActions.message.type]}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{adminActions.message.icon}</span>
                      <p className="text-sm font-medium">{adminActions.message.text}</p>
                    </div>
                  </div>
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
                      <Button variant="ghost" onClick={() => { setRejecting(false); setRejectReason('') }} className="flex-1">إلغاء</Button>
                      <Button onClick={handleReject} loading={saving} disabled={!rejectReason.trim()} className="flex-1">تأكيد الرفض</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted">راجع المحتوى ثم أرسل العرض للعميل، أو ارفض الطلب.</p>
                    <Button onClick={() => setComposingQuote(true)} className="w-full">📤 إرسال العرض للعميل</Button>
                    <Button variant="outline" onClick={() => setRejecting(true)} className="w-full">رفض الطلب</Button>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {/* تأكيد الدفع السريع */}
                  {request.receipt_url && ['approved', 'payment_review'].includes(request.status) && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-bold text-orange-700">📎 إيصال تحويل بانتظار التحقق</p>
                      <Button onClick={() => handleUpdateStatus('paid')} loading={saving} className="w-full">✓ تأكيد استلام الدفع</Button>
                    </div>
                  )}

                  {/* إرسال المحتوى */}
                  {request.status === 'in_progress' && !sendingContent && (() => {
                    const hasClientFeedback = !!request.user_feedback
                    const isContentApproved = !!request.content_approved_at && !hasClientFeedback

                    if (hasClientFeedback) {
                      return (
                        <div className="space-y-3">
                          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3">
                            <h4 className="font-bold text-yellow-700">✏️ العميل طلب تعديلات على المحتوى</h4>
                            <div className="bg-white rounded-lg p-3">
                              <p className="text-xs font-medium text-yellow-700 mb-1">ملاحظات العميل:</p>
                              <p className="text-sm text-yellow-800 whitespace-pre-line">{request.user_feedback}</p>
                            </div>
                            {request.proposed_content && (
                              <div className="bg-white rounded-lg p-3">
                                <p className="text-xs font-medium text-yellow-700 mb-1">المحتوى السابق:</p>
                                <p className="text-sm text-yellow-600 whitespace-pre-line line-clamp-4">{request.proposed_content}</p>
                              </div>
                            )}
                            <Button onClick={() => setSendingContent(true)} className="w-full">✏️ تعديل المحتوى وإعادة الإرسال</Button>
                          </div>
                        </div>
                      )
                    }

                    if (isContentApproved) {
                      return (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                          <h4 className="font-bold text-green-700">✅ تم اعتماد المحتوى من العميل</h4>
                          {request.proposed_content && (
                            <div className="bg-white rounded-lg p-3">
                              <p className="text-xs font-medium text-green-700 mb-1">المحتوى المعتمد:</p>
                              <p className="text-sm text-green-600 whitespace-pre-line line-clamp-4">{request.proposed_content}</p>
                            </div>
                          )}
                          <p className="text-xs text-green-600">انتقل لمرحلة النشر</p>
                        </div>
                      )
                    }

                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                        <h4 className="font-bold text-blue-700">📝 إرسال المحتوى للمراجعة</h4>
                        <p className="text-sm text-blue-600">أرسل النص والتصميم المقترح للعميل للمراجعة والموافقة</p>
                        <Button onClick={() => setSendingContent(true)} className="w-full">📤 إرسال المحتوى للعميل</Button>
                      </div>
                    )
                  })()}

                  {(request.status === 'content_review' || request.status === 'in_progress') && (
                    <ContentDebugger requestId={request.id} />
                  )}

                  {sendingContent && request.status === 'in_progress' && (
                    <ContentSender
                      request={request}
                      onSent={() => { setSendingContent(false); window.location.reload() }}
                      onCancel={() => setSendingContent(false)}
                      initialContent={request.user_feedback ? (request.proposed_content ?? '') : undefined}
                      initialImages={request.user_feedback ? (request.proposed_images ?? []) : undefined}
                      isRevision={!!request.user_feedback}
                    />
                  )}

                  {/* التفاوض */}
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
                            <h5 className="font-medium text-orange-700 mb-1">السعر المقترح:</h5>
                            <p className="text-orange-600 font-bold text-lg">{formatNumber(request.client_proposed_price)} ر.س</p>
                            <p className="text-xs text-orange-500">(الأصلي: {formatNumber(request.admin_quoted_price)} ر.س)</p>
                          </div>
                        )}
                      </div>
                      <Button onClick={() => setRespondingToNegotiation(true)} className="w-full">🤝 الرد على طلب التفاوض</Button>
                    </div>
                  )}

                  {request.status === 'negotiation' && respondingToNegotiation && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-orange-700">🤝 الرد على طلب التفاوض</h4>
                        <Button variant="ghost" size="sm" onClick={() => { setRespondingToNegotiation(false); setDiscountPercentage(''); setNegotiationNotes('') }} className="text-orange-600 hover:bg-orange-100">إلغاء</Button>
                      </div>
                      <div className="bg-white rounded-lg p-3 space-y-1 text-sm">
                        <div><span className="font-medium text-orange-700">رسالة العميل: </span><span className="text-orange-600">{request.negotiation_reason}</span></div>
                        {request.client_proposed_price && (
                          <div><span className="font-medium text-orange-700">السعر المقترح: </span><span className="text-orange-600 font-bold">{formatNumber(request.client_proposed_price)} ر.س</span></div>
                        )}
                        <div><span className="font-medium text-orange-700">السعر الأصلي: </span><span className="text-orange-600">{formatNumber(request.admin_quoted_price)} ر.س</span></div>
                      </div>
                      <div className="space-y-4">
                        {request.client_proposed_price && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h5 className="font-bold text-green-700 mb-2">✅ قبول السعر المقترح</h5>
                            <p className="text-sm text-green-600 mb-3">الموافقة على <strong>{formatNumber(request.client_proposed_price)} ر.س</strong></p>
                            <Button onClick={handleAcceptClientPrice} loading={saving} className="w-full bg-green-600 hover:bg-green-700">قبول السعر المقترح</Button>
                          </div>
                        )}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h5 className="font-bold text-blue-700 mb-2">🏷️ تطبيق نسبة خصم</h5>
                          <div className="space-y-3">
                            <input
                              type="number"
                              value={discountPercentage}
                              onChange={e => setDiscountPercentage(e.target.value)}
                              min="0" max="100" step="1"
                              className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                              placeholder="نسبة الخصم % — مثلاً: 10"
                            />
                            {discountPercentage && !isNaN(parseFloat(discountPercentage)) && (
                              <p className="text-xs text-blue-600">
                                السعر الجديد: <strong>{formatNumber((request.admin_quoted_price || 0) * (1 - parseFloat(discountPercentage) / 100))} ر.س</strong>
                              </p>
                            )}
                            <Button onClick={handleApplyDiscount} loading={saving} disabled={!discountPercentage.trim()} className="w-full bg-blue-600 hover:bg-blue-700">تطبيق الخصم وإرسال العرض</Button>
                          </div>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <h5 className="font-bold text-red-700 mb-2">❌ رفض التفاوض</h5>
                          <p className="text-sm text-red-600 mb-3">الإبقاء على <strong>{formatNumber(request.admin_quoted_price)} ر.س</strong> نهائياً</p>
                          <Button onClick={handleRejectNegotiation} loading={saving} className="w-full bg-red-600 hover:bg-red-700">رفض التفاوض والإبقاء على السعر</Button>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-orange-700 mb-1">رسالة للعميل (اختيارية)</label>
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

                  {request.status === 'content_review' && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <h4 className="font-bold text-purple-700 mb-2">👁️ في انتظار مراجعة العميل</h4>
                      <p className="text-sm text-purple-600 mb-3">تم إرسال المحتوى للعميل.</p>
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

                  {/* ضوابط الأدمن */}
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
                              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm mb-3"
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
                        {waitingForClient(request.status as any) && !adminActions.showStatusUpdate && (
                          <div className="text-center py-6">
                            <div className="inline-flex items-center gap-2 text-muted">
                              <span className="text-lg">⏳</span>
                              <span className="text-sm">لا توجد إجراءات مطلوبة حالياً</span>
                            </div>
                          </div>
                        )}
                        {isFinalStatus(request.status as any) && (
                          <div className="text-center py-6">
                            <div className="inline-flex items-center gap-2 text-muted">
                              <span className="text-lg">{request.status === 'completed' ? '🎉' : '📋'}</span>
                              <span className="text-sm">طلب منتهي</span>
                            </div>
                          </div>
                        )}
                        <div className="border-t border-border pt-4 mt-4 space-y-3">
                          <Button
                            variant="outline"
                            onClick={handleSendReminder}
                            className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                            disabled={sendingReminder || !request.client_email}
                            loading={sendingReminder}
                          >
                            📧 إرسال تذكير للعميل
                          </Button>
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

      {/* ── Dialog حذف الطلب ─────────────────────────────────────────── */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-700 mb-2">تأكيد حذف الطلب</h3>
              <p className="text-sm text-gray-600">
                هل أنت متأكد من حذف طلب <strong>{generateRequestNumber(request.request_number)}</strong>؟
              </p>
              <div className="mt-4 p-4 bg-gray-50 rounded-xl text-right space-y-1 text-xs text-gray-600">
                <div><strong>العميل:</strong> <ClientName name={request.client_name || ''} className="inline" /></div>
                {request.title && <div><strong>العنوان:</strong> {request.title}</div>}
                <div><strong>الحالة:</strong> <StatusBadge status={request.status} userRole="admin" /></div>
                {(request.final_total || request.admin_quoted_price) && (
                  <div><strong>المبلغ:</strong> {formatNumber(request.final_total || request.admin_quoted_price)} ر.س</div>
                )}
              </div>
              <p className="text-xs text-red-600 mt-4 font-bold">⚠️ هذا الإجراء لا يمكن التراجع عنه!</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1" disabled={deleting}>إلغاء</Button>
              <Button onClick={handleDeleteRequest} loading={deleting} className="flex-1 bg-red-600 hover:bg-red-700">حذف نهائياً</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── مكوّن مساعد للصفوف ────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted block mb-0.5">{label}</span>
      <div className="font-medium text-dark">{children}</div>
    </div>
  )
}
