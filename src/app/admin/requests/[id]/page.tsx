'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CATEGORIES, EXTRAS, PACKAGES, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import ClientName from '@/components/ui/ClientName'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QuoteComposer from '@/components/admin/QuoteComposer'
import ContentSender from '@/components/admin/ContentSender'
import CampaignReviewSender from '@/components/admin/CampaignReviewSender'
import CampaignAutoGenerator from '@/components/admin/CampaignAutoGenerator'
import AIStudioPanel from '@/components/admin/AIStudioPanel'
import ImageEditSchedule from '@/components/admin/ImageEditSchedule'
import PostReviewStatus from '@/components/admin/PostReviewStatus'
import CampaignPostStatusManager from '@/components/admin/CampaignPostStatusManager'
import EditableNewsContent from '@/components/admin/EditableNewsContent'
import SupportingDocumentsList from '@/components/request/SupportingDocumentsList'
import { getReviewItems, getPostReviews } from '@/lib/review-items'
import { getAdminActions, waitingForClient, isFinalStatus, messageColors } from '@/lib/admin-actions'
import { parseStoreRequestMeta } from '@/lib/inventor-store-studios'

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

type TabKey = 'details' | 'content' | 'actions' | 'log'
type ContentView = 'studio' | 'review' | 'history'

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
  const [savingAdminNote, setSavingAdminNote] = useState(false)
  const [composingQuote, setComposingQuote] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [sendingContent, setSendingContent] = useState(false)
  const [showAIStudio, setShowAIStudio] = useState(false)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [aiContent, setAiContent] = useState<string | null>(null)
  const [aiImages, setAiImages] = useState<string[] | null>(null)
  const [aiPostIndex, setAiPostIndex] = useState<number | null>(null)
  const [respondingToNegotiation, setRespondingToNegotiation] = useState(false)
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [negotiationNotes, setNegotiationNotes] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('details')
  const [contentView, setContentView] = useState<ContentView>('studio')
  const [infoMessage, setInfoMessage] = useState('')
  const [requestingInfo, setRequestingInfo] = useState(false)
  // يُبدّل قيمته لإعادة تهيئة محرّر الإرسال بالمحتوى الجديد عند «استخدم هذا التصميم»
  const [senderNonce, setSenderNonce] = useState(0)

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

  const handleUpdateStatus = async (overrideStatus?: string, overrideAdminNotes?: string | null) => {
    if (!request) return
    setSaving(true)
    const statusToSend = overrideStatus ?? newStatus
    const res = await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, status: statusToSend, adminNotes: overrideAdminNotes ?? adminNotes }),
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

  const handleConfirmPayment = async () => {
    setShowPaymentConfirm(false)
    if (request?.status === 'payment_review' && request.receipt_url) {
      await handleUpdateStatus('in_progress', 'تم تأكيد التحويل البنكي وبدء تنفيذ الطلب')
      return
    }
    await handleUpdateStatus('paid')
  }

  const handleSaveAdminNote = async () => {
    if (!request) return
    setSavingAdminNote(true)
    try {
      const res = await fetch('/api/admin/request-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, adminNotes: adminNotes.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        showToast(data.error ?? 'تعذّر حفظ ملاحظة الإدارة', 'error')
        return
      }
      setRequest((current: typeof request) => current ? { ...current, admin_notes: data.adminNotes } : current)
      showToast(adminNotes.trim() ? 'تم حفظ ملاحظة الإدارة' : 'تم حذف ملاحظة الإدارة')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSavingAdminNote(false)
    }
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

  const handleRequestMoreInfo = async () => {
    if (!request) return
    if (infoMessage.trim().length < 5) {
      showToast('اكتب رسالة توضّح المطلوب من العميل', 'error')
      return
    }
    setRequestingInfo(true)
    try {
      const res = await fetch('/api/admin/request-more-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, message: infoMessage.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast('تم إرسال الطلب للعميل')
        window.location.reload()
      } else {
        showToast(data.error ?? 'فشل إرسال الطلب', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setRequestingInfo(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (!request) return null

  const adminActions = getAdminActions(request.status as any)
  const isPendingPhase = request.status === 'pending' || request.status === 'client_rejected'
  const isPendingMembership = request.status === 'pending' && request.billing_source === 'membership'
  const canConfirmPayment = ['approved', 'payment_review'].includes(request.status)
  const storeRequestMeta = parseStoreRequestMeta(request.sub_option)

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'details', label: '📋 تفاصيل الطلب' },
    ...(!storeRequestMeta ? [{ key: 'content' as TabKey, label: '🎨 المحتوى والتصاميم' }] : []),
    { key: 'actions', label: '⚙️ الإجراءات' },
    { key: 'log',     label: '🕓 سجل الإجراءات' },
  ]

  // مُولّد دالة onUsed للاستوديو (يُستخدم في المفرد والحملة)
  // يُمرّر التركيز إلى محرّر الإرسال (يظهر أسفل الاستوديوهات الطويلة في الحملات)
  const focusSender = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        document.getElementById('content-sender-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 120)
    }
  }

  const studioOnUsed = (text: string, images: string[], reviewIndex: number) => {
    setAiContent(text)
    setAiImages(Array.isArray(images) ? images : [])
    setAiPostIndex(reviewIndex)
    // الانتقال لمراجعة العميل لأن محرّر الإرسال يعيش هناك، ولا يتم الإرسال تلقائياً.
    setContentView('review')
    setSendingContent(true)
    setSenderNonce(n => n + 1)
    focusSender()
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-5xl mx-auto p-4 md:p-6">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="mb-5">
          <Link href={storeRequestMeta ? '/admin/inventor-store-requests' : '/admin/requests'} className="inline-flex items-center gap-2 text-green hover:underline mb-4">
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

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        {storeRequestMeta && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/45 bg-gold/10 p-4">
            <div>
              <strong className="block text-dark">هذا طلب من متجر مسار المخترع</strong>
              <span className="text-sm text-muted">تنفيذ المخرجات وإصداراتها يتم داخل استديو الخدمة المخصص.</span>
            </div>
            <Link href={`/admin/inventor-store-requests/${request.id}`} className="rounded-lg bg-dark px-4 py-2.5 text-sm font-bold text-white">
              فتح استديو الخدمة
            </Link>
          </div>
        )}

        <div className="mb-5 flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                activeTab === t.key ? 'border-green text-green' : 'border-transparent text-muted hover:text-dark'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════ تبويب: تفاصيل الطلب ════════ */}
        <div className={activeTab === 'details' ? 'space-y-5' : 'hidden'}>
          <DetailsTab request={request} />
        </div>

        {/* ════════ تبويب: المحتوى والتصاميم ════════ */}
        <div className={activeTab === 'content' ? 'space-y-5' : 'hidden'}>
          {request.status === 'in_progress' || request.status === 'completed' || request.status === 'changes_requested' ||
           (request.status === 'content_review' && request.request_type === 'campaign') ? (
           <>
              <div className="sticky top-0 z-10 -mx-1 border-b border-border bg-cream/95 px-1 pb-3 pt-1 backdrop-blur">
                <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="مساحة عمل المحتوى">
                  {([
                    ['studio', '✦ الاستديو الداخلي'],
                    ['review', '👁 مراجعة العميل'],
                    ['history', '◷ سجل الجولات'],
                  ] as Array<[ContentView, string]>).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setContentView(key)}
                      className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition ${contentView === key ? 'border-green bg-green text-white' : 'border-border bg-white text-muted hover:text-dark'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={contentView === 'studio' ? 'space-y-5' : 'hidden'}>
              {/* استوديو الذكاء الاصطناعي — متاح في التنفيذ وبعد الاكتمال (لاختيار تصميم المجلة) */}
              <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
                  <Button variant="outline" onClick={() => setShowAIStudio(v => !v)} className="w-full">
                    🤖 {showAIStudio ? 'إخفاء استوديو الذكاء الاصطناعي' : 'استوديو الذكاء الاصطناعي'}
                  </Button>
                  {showAIStudio && (() => {
                    const campaignPosts = Array.isArray(request.campaign_posts) ? request.campaign_posts : []
                    if (request.request_type === 'campaign' && campaignPosts.length > 0) {
                      return (
                        <div className="space-y-5">
                          <p className="text-xs text-muted bg-cream rounded-lg p-2">
                            🚀 هذه حملة من {campaignPosts.length} منشورات — لكل خبر استوديو مستقل خاص به.
                          </p>
                          <CampaignAutoGenerator request={request} onFinished={() => window.location.reload()} />
                          {campaignPosts.map((post: Record<string, unknown>, idx: number) => (
                            <details key={idx} className="group rounded-2xl border border-border/70 bg-cream/30">
                              <summary className="cursor-pointer list-none p-3 flex items-center gap-2 text-sm font-bold text-dark">
                                <span className="w-6 h-6 rounded-full bg-green/10 text-green flex items-center justify-center text-xs">{idx + 1}</span>
                                <span className="min-w-0 flex-1 truncate">{(post.title as string) || `منشور ${idx + 1}`}</span>
                                <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
                              </summary>
                              <div className="border-t border-border/70 p-3">
                              <AIStudioPanel
                                request={request}
                                postIndex={idx}
                                postTitle={(post.title as string) || undefined}
                                postImages={Array.isArray(post.images) ? (post.images as string[]) : []}
                                savedStudio={request.ai_posts?.[idx]}
                                onUsedContent={studioOnUsed}
                              />
                              </div>
                            </details>
                          ))}
                        </div>
                      )
                    }
                    return <AIStudioPanel request={request} onUsedContent={studioOnUsed} />
                  })()}
              </div>

              {/* رفع صورة وتعديلها مباشرة + جدولة نشر بلا المرور بخط تحليل الخبر الكامل */}
              <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
                <Button variant="outline" onClick={() => setShowImageUpload(v => !v)} className="w-full">
                  ✂️ {showImageUpload ? 'إخفاء رفع وتعديل صورة' : 'رفع صورة وتعديلها + جدولة مباشرة'}
                </Button>
                {showImageUpload && <ImageEditSchedule />}
              </div>

              {/* طلب صورة/معلومات من العميل */}
              {!sendingContent && (
                <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
                  <h4 className="font-bold text-dark">📩 طلب صورة/معلومات من العميل</h4>
                  <p className="text-xs text-muted">
                    إن كانت الصورة المرفقة غير مناسبة أو تحتاج تفاصيل أكثر عن الخبر، اكتب ما تريده — سيتمكّن العميل من تعديل طلبه (الصور/المحتوى) وإعادة إرساله.
                  </p>
                  <textarea
                    value={infoMessage}
                    onChange={e => setInfoMessage(e.target.value)}
                    placeholder="مثلاً: الصورة غير واضحة، يرجى إرفاق صورة أعلى دقة، أو إضافة تفاصيل عن مكان وتاريخ الإنجاز..."
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[80px] resize-y"
                  />
                  <Button
                    onClick={handleRequestMoreInfo}
                    loading={requestingInfo}
                    disabled={requestingInfo || !infoMessage.trim()}
                    variant="outline"
                    className="w-full"
                  >
                    📩 إرسال الطلب للعميل
                  </Button>
                </div>
              )}

              </div>

              <div className={contentView === 'review' ? 'space-y-5' : 'hidden'}>
              {/* إرسال المحتوى — مطالبات الحالة (المسار العام/القديم) */}
              {!sendingContent && (() => {
                const hasClientFeedback = !!request.user_feedback
                const isContentApproved = !!request.content_approved_at && !hasClientFeedback

                if (hasClientFeedback) {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 space-y-3">
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
                  )
                }

                if (isContentApproved) {
                  return (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-2">
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

                const isCampaign = request.request_type === 'campaign' && Array.isArray(request.campaign_posts) && request.campaign_posts.length > 0
                const hasSentPostReview = !!request.post_reviews && typeof request.post_reviews === 'object' && Object.keys(request.post_reviews).length > 0
                if (hasSentPostReview) return null
                return (
                  <div className="space-y-4">
                    {isCampaign && <CampaignReviewSender request={request} onSent={() => window.location.reload()} />}
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
                    <h4 className="font-bold text-blue-700">📝 إرسال المحتوى للمراجعة</h4>
                    {isCampaign ? (
                      <p className="text-sm text-blue-600">لكل خبر في الحملة استوديو خاص به — استخدم الاستوديو أعلاه لتوليد وإرسال محتوى كل خبر على حدة. يمكنك بعد الإرسال تعديله من «حالة مراجعة العميل» أدناه.</p>
                    ) : (
                      <>
                        <p className="text-sm text-blue-600">استخدم الاستوديو أعلاه لتوليد المحتوى، أو أرسل محتوى يدوياً مباشرةً للعميل. بعد الإرسال يمكنك تعديله من «حالة مراجعة العميل» أدناه قبل موافقة العميل.</p>
                        <Button
                          onClick={() => { setAiContent(null); setAiImages(null); setAiPostIndex(0); setSendingContent(true); setSenderNonce(n => n + 1); focusSender() }}
                          className="w-full"
                        >
                          📤 إرسال محتوى يدوياً للعميل
                        </Button>
                      </>
                    )}
                    </div>
                  </div>
                )
              })()}

              {/* محرّر إرسال/تعديل المحتوى */}
              {sendingContent && (
                <div id="content-sender-anchor" className="bg-card rounded-2xl border border-border p-5 scroll-mt-20">
                  <ContentSender
                    key={senderNonce}
                    request={request}
                    onSent={() => { setSendingContent(false); setAiContent(null); setAiImages(null); setAiPostIndex(null); window.location.reload() }}
                    onCancel={() => { setSendingContent(false); setAiContent(null); setAiImages(null); setAiPostIndex(null) }}
                    initialContent={aiContent ?? (request.user_feedback ? (request.proposed_content ?? '') : undefined)}
                    initialImages={aiImages ?? (request.user_feedback ? (request.proposed_images ?? []) : undefined)}
                    isRevision={!!request.user_feedback}
                    postIndex={aiPostIndex ?? undefined}
                    postLabel={
                      aiPostIndex != null && request.request_type === 'campaign' && Array.isArray(request.campaign_posts)
                        ? `منشور ${aiPostIndex + 1}${request.campaign_posts[aiPostIndex]?.title ? ' — ' + request.campaign_posts[aiPostIndex].title : ''}`
                        : undefined
                    }
                  />
                </div>
              )}
              </div>
            </>
          ) : request.status === 'info_requested' ? (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-2">
              <h4 className="font-bold text-orange-700">📩 بانتظار تعديل العميل</h4>
              <p className="text-sm text-orange-600">تم طلب معلومات/صور إضافية من العميل. ستعود أدوات المحتوى بعد تعديله وإعادة إرساله.</p>
              {request.admin_info_request && (
                <div className="bg-white rounded-lg p-3 border border-orange-200">
                  <p className="text-xs font-bold text-orange-700 mb-1">رسالتك المُرسلة:</p>
                  <p className="text-sm text-dark whitespace-pre-line">{request.admin_info_request}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border p-5 text-sm text-muted">
              أدوات المحتوى (الاستوديو والإرسال) متاحة عندما يكون الطلب في مرحلة «قيد التنفيذ».
            </div>
          )}

          {/* حالة مراجعة العميل لكل خبر + تعديل المحتوى المُرسل قبل الموافقة */}
          {contentView === 'review' && <PostReviewStatus
            request={request}
            view="current"
            onEdit={(idx, content, images) => {
              setAiContent(content ?? '')
              setAiImages(Array.isArray(images) ? images : [])
              setAiPostIndex(idx)
              setContentView('review')
              setSendingContent(true)
              setSenderNonce(n => n + 1)
              setActiveTab('content')
              focusSender()
            }}
          />}
          {contentView === 'history' && <PostReviewStatus request={request} view="history" />}
        </div>

        {/* ════════ تبويب: الإجراءات ════════ */}
        <div className={activeTab === 'actions' ? 'space-y-5' : 'hidden'}>
          {/* حالة نشر كل خبر في الحملة (للحملات فقط) */}
          <CampaignPostStatusManager request={request} />

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

            <div className={`rounded-xl p-4 mb-4 border ${messageColors[isPendingMembership ? 'warning' : adminActions.message.type]}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{isPendingMembership ? '◉' : adminActions.message.icon}</span>
                <p className="text-sm font-medium">
                  {isPendingMembership
                    ? 'طلب من رصيد العضوية يحتاج مراجعة الإدارة قبل بدء التنفيذ. الرصيد والمزايا المختارة محجوزة مؤقتاً.'
                    : adminActions.message.text}
                </p>
              </div>
            </div>

            {isPendingPhase ? (
              isPendingMembership ? (
                rejecting ? (
                  <div className="space-y-3">
                    <h4 className="font-bold text-dark">رفض طلب العضوية</h4>
                    <p className="text-xs leading-5 text-muted">اشرح سبب الرفض للعميل. عند التأكيد سيُعاد رصيد المنشور وجميع المزايا المحجوزة تلقائياً.</p>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[120px] resize-y"
                      placeholder="اكتب سبب عدم مناسبة الطلب للتنفيذ..."
                    />
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => { setRejecting(false); setRejectReason('') }} className="flex-1">إلغاء</Button>
                      <Button onClick={handleReject} loading={saving} disabled={!rejectReason.trim()} className="flex-1">رفض وإعادة الرصيد</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs leading-5 text-dark">
                      راجع ملاءمة الخبر وصحة البيانات والصور. عند القبول يبدأ التنفيذ ويُستهلك الرصيد المحجوز نهائياً.
                    </div>
                    <Button
                      onClick={() => {
                        if (confirm('هل راجعت الطلب وتريد قبوله وبدء التنفيذ؟ سيُستهلك الرصيد المحجوز.')) {
                          handleUpdateStatus('in_progress', 'تمت مراجعة طلب العضوية وقبوله لبدء التنفيذ')
                        }
                      }}
                      loading={saving}
                      className="w-full"
                    >
                      قبول الطلب وبدء التنفيذ
                    </Button>
                    <Button variant="outline" onClick={() => setRejecting(true)} className="w-full border-red-200 text-red-700 hover:bg-red-50">
                      رفض الطلب وإعادة الرصيد
                    </Button>
                  </div>
                )
              ) : composingQuote ? (
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
              ) : request.status === 'client_rejected' ? (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                    <p className="text-sm font-bold text-red-700">❌ رفض العميل العرض السابق</p>
                    {request.client_rejection_reason && (
                      <p className="text-xs text-red-600 whitespace-pre-line">
                        سبب الرفض: {request.client_rejection_reason}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted">يمكنك تعديل السعر وإرسال عرض جديد — سيعود الطلب لحالة «بانتظار موافقة العميل» بمهلة جديدة.</p>
                  <Button onClick={() => setComposingQuote(true)} className="w-full">📤 إرسال عرض جديد للعميل</Button>
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
                {canConfirmPayment && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-bold text-orange-700">
                      {request.receipt_url ? '📎 إيصال تحويل بانتظار التحقق' : '💳 بانتظار تأكيد استلام الدفع'}
                    </p>
                    <p className="text-xs text-orange-700/80">
                      {request.receipt_url
                        ? 'راجع الإيصال ثم أكّد الدفع لبدء التنفيذ.'
                        : 'استخدم هذا الإجراء عند استلام تأكيد الدفع خارج المنصة، مثل واتساب أو التحويل البنكي.'}
                    </p>
                    <Button onClick={() => setShowPaymentConfirm(true)} loading={saving} className="w-full">✓ تأكيد الدفع</Button>
                  </div>
                )}

                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-bold text-red-800">ملاحظة من الإدارة</label>
                    <p className="text-xs text-red-700">تظهر للعميل باللون الأحمر في بطاقة الطلب.</p>
                  </div>
                  <textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    className="min-h-[88px] w-full resize-y rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-dark"
                    placeholder="اكتب الملاحظة التي تريد أن يراها العميل..."
                  />
                  <Button
                    variant="outline"
                    onClick={handleSaveAdminNote}
                    loading={savingAdminNote}
                    className="w-full border-red-300 text-red-700 hover:bg-red-100"
                  >
                    حفظ الملاحظة
                  </Button>
                </div>

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

                {/* ضوابط الأدمن */}
                {adminActions.showStatusUpdate && (
                  <div>
                    <label className="text-sm font-medium text-dark block mb-2">تحديث الحالة</label>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm mb-3"
                    >
                      {Object.entries(REQUEST_STATUSES).filter(([k]) => k !== 'suspended').map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {adminActions.showStatusUpdate && (
                  <Button onClick={() => handleUpdateStatus()} loading={saving} className="w-full">
                    حفظ وإرسال إشعار للعميل
                  </Button>
                )}
                {request.status === 'suspended' ? (
                  <Button onClick={() => handleUpdateStatus('resume')} loading={saving} className="w-full bg-green hover:bg-green/90">
                    ▶️ استئناف الطلب إلى مرحلته السابقة
                  </Button>
                ) : !isFinalStatus(request.status as any) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm('هل تريد تعليق هذا الطلب مؤقتاً؟ لن يُرسل أي إشعار للعميل.')) handleUpdateStatus('suspended')
                    }}
                    loading={saving}
                    className="w-full border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    ⏸️ تعليق الطلب دون إشعار العميل
                  </Button>
                )}
                {waitingForClient(request.status as any) && !adminActions.showStatusUpdate && !canConfirmPayment && (
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
              </div>
            )}
          </div>
        </div>

        {/* ════════ تبويب: سجل الإجراءات ════════ */}
        <div className={activeTab === 'log' ? 'space-y-5' : 'hidden'}>
          <ActivityTab request={request} />
        </div>
      </div>

      {/* ── Dialog تأكيد الدفع ───────────────────────────────────────── */}
      {showPaymentConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <div className="text-center">
              <div className="mb-3 text-5xl">💳</div>
              <h3 className="mb-2 text-xl font-bold text-dark">تأكيد الدفع</h3>
              <p className="text-sm text-muted">
                سيُعتمد الدفع لهذا الطلب، ويُسجّل وقت التأكيد ويصل إشعار للعميل.
              </p>
            </div>
            <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              استخدم هذا الإجراء فقط بعد التحقق من التحويل أو الدفع المستلم خارج المنصة.
            </div>
            <div className="mt-5 flex gap-3">
              <Button variant="outline" onClick={() => setShowPaymentConfirm(false)} className="flex-1" disabled={saving}>إلغاء</Button>
              <Button onClick={handleConfirmPayment} loading={saving} className="flex-1">تأكيد الدفع</Button>
            </div>
          </div>
        </div>

      )}

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

// ── تبويب التفاصيل (عرض فقط) ──────────────────────────────────────

function DetailsTab({ request }: { request: any }) {
  const cat = CATEGORIES.find(c => c.id === request.category)
  const selectedExtras: string[] = Array.isArray(request.user_selected_extras) ? request.user_selected_extras : []
  const subOptionLabel = renderSubOptionLabel(request.category, request.sub_option)
  const influencerName = request.influencer?.name_ar ?? null

  return (
    <div className="space-y-5">
      {/* ① بيانات العميل */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="font-bold text-dark mb-4 flex items-center gap-2">👤 بيانات العميل</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <InfoRow label="الاسم">
            <ClientName name={request.client_name || ''} className="font-medium" />
          </InfoRow>
          <InfoRow label="البريد الإلكتروني"><span dir="ltr">{request.client_email}</span></InfoRow>
          <InfoRow label="الجوال"><span dir="ltr">{request.client_phone}</span></InfoRow>
          {request.client_city && <InfoRow label="المدينة">{request.client_city}</InfoRow>}
          {request.client_type && (
            <InfoRow label="نوع العميل">
              <span className="font-medium">{CLIENT_TYPE_LABELS[request.client_type] ?? request.client_type}</span>
            </InfoRow>
          )}
          {request.org_name && (
            <InfoRow label="اسم الجهة"><span className="font-medium">{request.org_name}</span></InfoRow>
          )}
          {request.org_representative && (
            <InfoRow label="ممثل الجهة"><span className="font-medium">{request.org_representative}</span></InfoRow>
          )}
          {request.org_license && (
            <InfoRow label="السجل / الترخيص"><span className="font-medium">{request.org_license}</span></InfoRow>
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
        <h2 className="font-bold text-dark mb-4 flex items-center gap-2">📋 تفاصيل المنشور</h2>
        <div className="space-y-4 text-sm">
          {influencerName && (
            <InfoRow label="المؤثر"><span className="font-bold text-green">{influencerName}</span></InfoRow>
          )}
          <InfoRow label="الفئة">
            <span className="font-medium">{cat?.icon} {cat?.nameAr ?? request.category}</span>
          </InfoRow>

          {request.auto_quote_tier && (() => {
            const pkg = PACKAGES.find(p => p.id === request.auto_quote_tier)
            if (!pkg) return null
            return (
              <InfoRow label="الباقة">
                <div className="flex flex-col gap-1.5">
                  <span className="font-bold text-green">{pkg.name}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.features.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-lg bg-green/10 text-green text-[11px] font-medium">{f}</span>
                    ))}
                  </div>
                </div>
              </InfoRow>
            )
          })()}

          {subOptionLabel && (
            <InfoRow label="التفاصيل الفرعية">
              <span className="font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">{subOptionLabel}</span>
            </InfoRow>
          )}

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

          {request.billing_source === 'membership' && (
            <InfoRow label="طلب العضوية">
              <span className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-bold text-dark">
                {request.auto_quote_note || 'طلب مدفوع من رصيد العضوية'}
              </span>
            </InfoRow>
          )}

          {/* عنوان/نص الخبر — قابل للتعديل من الأدمن */}
          <EditableNewsContent
            requestId={request.id}
            initialTitle={request.title ?? ''}
            initialContent={request.content ?? ''}
          />

          {request.link && (
            <InfoRow label="رابط مرفق">
              <a href={request.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all" dir="ltr">
                {request.link}
              </a>
            </InfoRow>
          )}

          {request.hashtags && (
            <InfoRow label="الهاشتاقات">
              <span className="text-blue-600 font-medium" dir="ltr">{request.hashtags}</span>
            </InfoRow>
          )}

          {request.preferred_date && (
            <InfoRow label="التاريخ المفضل للنشر">
              <span className="font-medium text-orange-700">📅 {formatDate(request.preferred_date)}</span>
            </InfoRow>
          )}

          {Array.isArray(request.content_images) && request.content_images.length > 0 && (
            <div>
              <span className="text-muted block mb-2">الصور المرفقة ({request.content_images.length})</span>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {request.content_images.map((url: string, i: number) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-xl overflow-hidden border border-border hover:border-green/40 transition-colors block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
          <SupportingDocumentsList documents={request.supporting_documents} />
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

          {request.campaign_duration && (
            <div className="mb-4">
              <InfoRow label="مدة الحملة">
                <span className="font-medium">{CAMPAIGN_DURATION_LABELS[request.campaign_duration] ?? request.campaign_duration}</span>
              </InfoRow>
            </div>
          )}

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
                      {pCat && <div className="text-xs text-muted">{pCat.icon} {pCat.nameAr}</div>}
                    </div>
                    {!!post.preferred_date && (
                      <div className="text-xs text-orange-600 flex-shrink-0">📅 {formatDate(post.preferred_date as string)}</div>
                    )}
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    {subLabel && (
                      <div className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg inline-block">{subLabel}</div>
                    )}
                    {/* عنوان/نص المنشور — قابل للتعديل من الأدمن */}
                    <EditableNewsContent
                      requestId={request.id}
                      initialTitle={(post.title as string) ?? ''}
                      initialContent={(post.content as string) ?? ''}
                      postIndex={idx}
                    />
                    {!!post.link && (
                      <a href={post.link as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs break-all" dir="ltr">
                        {post.link as string}
                      </a>
                    )}
                    {!!post.hashtags && (
                      <div className="text-blue-600 text-xs font-medium" dir="ltr">{post.hashtags as string}</div>
                    )}
                    {Array.isArray(post.images) && (post.images as string[]).length > 0 && (
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {(post.images as string[]).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    <SupportingDocumentsList documents={post.supporting_documents} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ③ الخدمات الإضافية */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="font-bold text-dark mb-4 flex items-center gap-2">✨ الخدمات الإضافية</h2>
        {selectedExtras.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedExtras.map((eid: string) => {
                const extra = EXTRAS_MAP[eid]
                return (
                  <div key={eid} className="flex items-center justify-between bg-green/5 rounded-xl px-4 py-3 border border-green/20">
                    <span className="flex items-center gap-2 text-sm font-medium text-dark">
                      <span>{extra?.icon ?? '•'}</span>
                      <span>{extra?.nameAr ?? eid}</span>
                    </span>
                    <span className="text-sm font-bold text-green">+{formatNumber(extra?.price ?? 0)} ر.س</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 space-y-2 text-sm border-t border-border pt-3">
              <div className="flex justify-between text-muted">
                <span>إجمالي الخدمات الإضافية ({selectedExtras.length})</span>
                <span>+{formatNumber(request.extras_selected_total ?? 0)} ر.س</span>
              </div>
              <div className="flex justify-between font-black text-dark text-base">
                <span>الإجمالي النهائي</span>
                <span className="text-gold">{formatNumber(request.final_total ?? request.admin_quoted_price ?? 0)} ر.س</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">لا توجد خدمات إضافية مختارة</p>
        )}
      </div>

      {/* ④ معلومات التسعير */}
      {request.admin_quoted_price != null && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-dark flex items-center gap-2">💰 معلومات التسعير</h2>
            {request.auto_quoted_at && (
              <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">🤖 تسعير تلقائي</span>
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
              <span className="text-gold">{formatNumber(request.final_total ?? request.admin_quoted_price)} ر.س</span>
            </div>
            {request.auto_quote_note && (
              <p className="text-xs text-muted bg-cream rounded-lg p-2 mt-2">📝 {request.auto_quote_note}</p>
            )}
          </div>
        </div>
      )}

      {/* ⑤ سجل التفاوض */}
      {(request.negotiation_round > 0 || request.original_quoted_price) && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-bold text-dark mb-4 flex items-center gap-2">🤝 سجل التفاوض</h2>
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
                <span className="font-bold">{request.negotiation_round} / 3</span>
              </div>
            )}
            {request.negotiated_discount_percentage > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">الخصم المُمنَح</span>
                <span className="font-bold text-green">{request.negotiated_discount_percentage}%</span>
              </div>
            )}
            {request.admin_quoted_price != null && request.original_quoted_price != null && (
              <div className="flex justify-between font-bold border-t border-border pt-2">
                <span>السعر بعد التفاوض</span>
                <span className="text-green">{formatNumber(request.admin_quoted_price)} ر.س</span>
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
          <h2 className="font-bold text-dark mb-4 flex items-center gap-2">💳 بيانات الدفع</h2>
          <div className="space-y-2 text-sm">
            <InfoRow label="تاريخ الدفع"><span className="font-medium text-green">{formatDate(request.paid_at)}</span></InfoRow>
            {request.payment_method && (
              <InfoRow label="طريقة الدفع"><span className="font-medium">{request.payment_method}</span></InfoRow>
            )}
            {request.final_total && (
              <InfoRow label="المبلغ المدفوع"><span className="font-bold text-green">{formatNumber(request.final_total)} ر.س</span></InfoRow>
            )}
            {request.moyasar_payment_id && (
              <InfoRow label="معرّف Moyasar"><span dir="ltr" className="font-mono text-xs text-muted">{request.moyasar_payment_id}</span></InfoRow>
            )}
            {request.tamara_order_id && (
              <InfoRow label="معرّف Tamara"><span dir="ltr" className="font-mono text-xs text-muted">{request.tamara_order_id}</span></InfoRow>
            )}
          </div>
        </div>
      )}

      {/* ⑦ ملاحظات الإدارة */}
      {request.admin_notes && (
        <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-5">
          <h2 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">📝 ملاحظات الإدارة</h2>
          <p className="text-sm text-yellow-700 whitespace-pre-line">{request.admin_notes}</p>
        </div>
      )}
    </div>
  )
}

// ── تبويب سجل الإجراءات (خط زمني للقراءة فقط) ─────────────────────

function ActivityTab({ request }: { request: any }) {
  type Ev = { t: string; icon: string; label: string }
  const evs: Ev[] = []
  const add = (t: any, icon: string, label: string) => { if (t) evs.push({ t, icon, label }) }

  add(request.created_at, '📝', 'إنشاء الطلب')
  add(request.auto_quoted_at, '🤖', 'تسعير تلقائي وإرسال العرض')
  add(request.negotiated_at, '🤝', 'تحديث/تفاوض على السعر')
  add(request.paid_at, '💳', 'تأكيد الدفع')
  // المسار العام (القديم) لمراجعة المحتوى
  add(request.content_sent_at, '📤', 'إرسال المحتوى للمراجعة')
  add(request.content_approved_at, '✅', 'اعتمد العميل المحتوى')
  add(request.feedback_sent_at, '✏️', 'طلب العميل تعديلات على المحتوى')

  // أحداث المراجعة لكل خبر
  const items = getReviewItems(request)
  const reviews = getPostReviews(request)
  items.forEach(it => {
    const r = reviews[it.index]
    if (!r) return
    add(r.content_sent_at, '📤', `إرسال محتوى: ${it.title}`)
    add(r.content_approved_at, '✅', `اعتماد العميل: ${it.title}`)
    add(r.feedback_sent_at, '✏️', `ملاحظات العميل على: ${it.title}`)
  })

  add(request.updated_at, '🕓', 'آخر تحديث للطلب')

  evs.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())

  return (
    <div className="bg-card rounded-2xl border border-border p-5" dir="rtl">
      <h3 className="font-bold text-dark mb-4 flex items-center gap-2">🕓 سجل الإجراءات على الطلب</h3>
      {evs.length === 0 ? (
        <p className="text-sm text-muted">لا يوجد سجل بعد.</p>
      ) : (
        <ol className="space-y-0">
          {evs.map((e, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center text-sm flex-shrink-0">{e.icon}</span>
                {i < evs.length - 1 && <span className="flex-1 w-px bg-border my-1" />}
              </div>
              <div className="pb-4 pt-1">
                <p className="text-sm font-medium text-dark">{e.label}</p>
                <p className="text-xs text-muted">{formatDate(e.t)}</p>
              </div>
            </li>
          ))}
        </ol>
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
