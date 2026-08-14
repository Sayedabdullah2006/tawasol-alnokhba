'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { CATEGORIES, PACKAGES, REQUEST_STATUSES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import StatusBadge from '@/components/dashboard/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import ClientNameFixed from '@/components/ui/ClientNameFixed'
import NameDisplayTest from '@/components/debug/NameDisplayTest'
import { INVENTOR_STORE_PRODUCTS } from '@/lib/inventor-store'

const REQUESTS_PER_PAGE = 10
const REFUND_QUICK_ACTION = '__refund__'

const QUICK_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['rejected', 'suspended'],
  negotiation: ['pending', 'rejected', 'suspended'],
  client_rejected: ['pending', 'rejected', 'suspended'],
  approved: ['paid', 'suspended'],
  payment_review: ['in_progress', 'approved', 'rejected', 'suspended'],
  paid: ['in_progress', 'suspended'],
  in_progress: ['content_review', 'scheduled', 'completed', 'info_requested', 'suspended'],
  info_requested: ['in_progress', 'content_review', 'suspended'],
  content_review: ['in_progress', 'scheduled', 'completed', 'changes_requested', 'suspended'],
  changes_requested: ['in_progress', 'content_review', 'completed', 'suspended'],
  scheduled: ['completed', 'in_progress', 'suspended'],
  suspended: ['resume'],
  rejected: ['pending'],
  auto_closed: ['pending'],
}

const quickStatusTransitionsFor = (status: string, billingSource?: string | null): string[] => {
  if (status === 'rejected' && billingSource === 'membership') return []
  const baseTransitions = QUICK_STATUS_TRANSITIONS[status] ?? []
  if (status === 'pending' && billingSource === 'membership') {
    return ['in_progress', 'rejected', 'suspended']
  }
  const transitions = baseTransitions
  return status === 'scheduled' || transitions.includes('scheduled')
    ? transitions
    : [...transitions, 'scheduled']
}

type RequestScope = 'direct' | 'membership' | 'inventor-store'

type AdminRequest = {
  id: string
  user_id?: string | null
  request_number: number
  client_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  client_mobile?: string | null
  phone?: string | null
  title?: string | null
  content?: string | null
  admin_notes?: string | null
  admin_thumbnail_url?: string | null
  status: string
  created_at: string
  billing_source?: string | null
  membership_id?: string | null
  membership_credits?: number | null
  membership_credit_status?: string | null
  sub_option?: unknown
  content_images?: unknown
  final_total?: number | null
  admin_quoted_price?: number | null
  payment_status?: string | null
  paid_at?: string | null
  moyasar_payment_id?: string | null
  tamara_order_id?: string | null
  offer_discount_sent_at?: string | null
  offer_original_price?: number | null
  offer_discount_pct?: number | null
  remainingRefundAmount?: number
  selected_package?: string | null
  category?: string | null
  auto_quote_tier?: string | null
  campaign_post_count?: number | null
  num_posts?: number | null
  request_type?: string | null
  is_external?: boolean | null
  link?: string | null
  refund_timing?: string | null
}

type RequestReview = {
  request_id: string
  rating?: number | null
  comment?: string | null
  invitation_sent_at?: string | null
}

type RefundRecord = {
  id: string
  request_id: string
  status: string
  amount: number
  provider?: string | null
}

const formatRequestNumber = (serial: AdminRequest['request_number']): string =>
  generateRequestNumber(serial)

const getStoreRequestMeta = (request: { sub_option?: unknown }) => {
  if (typeof request.sub_option !== 'string') return null
  try {
    const parsed = JSON.parse(request.sub_option)
    return parsed?.source === 'inventor_store' ? parsed as { product_slug?: string; product_name?: string; listed_price?: number } : null
  } catch { return null }
}

export function AdminRequestsPage({ scope = 'direct' }: { scope?: RequestScope }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { showToast } = useToast()
  const membershipOnly = scope === 'membership'
  const storeOnly = scope === 'inventor-store'
  const directOnly = scope === 'direct'
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [requests, setRequests] = useState<AdminRequest[]>([])
  const [requestSummaries, setRequestSummaries] = useState<AdminRequest[]>([])
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '')
  const [serviceFilter, setServiceFilter] = useState(() => searchParams.get('service') ?? '')
  const [duplicatesOnly, setDuplicatesOnly] = useState(() => searchParams.get('duplicates') === '1')
  const [currentPage, setCurrentPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  // فلتر المستخدم: مفتاح المستخدم المختار + نص البحث في القائمة + إظهار القائمة
  const [userFilter, setUserFilter] = useState(() => searchParams.get('user') ?? '')
  const [userQuery, setUserQuery] = useState('')
  const [showUserList, setShowUserList] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => Boolean(searchParams.get('user')) || searchParams.get('duplicates') === '1')
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [requestToDelete, setRequestToDelete] = useState<AdminRequest | null>(null)
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [sendingBulkReminder, setSendingBulkReminder] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkApplyDiscount, setBulkApplyDiscount] = useState(false)
  const [bulkDiscountPct, setBulkDiscountPct] = useState<number>(10)
  const [reminderTarget, setReminderTarget] = useState<AdminRequest | null>(null)
  const [singleApplyDiscount, setSingleApplyDiscount] = useState(false)
  const [singleDiscountPct, setSingleDiscountPct] = useState<number>(10)
  const [quickNoteTarget, setQuickNoteTarget] = useState<AdminRequest | null>(null)
  const [quickNote, setQuickNote] = useState('')
  const [savingQuickNote, setSavingQuickNote] = useState(false)
  const [quickActionTarget, setQuickActionTarget] = useState<AdminRequest | null>(null)
  const [quickActionStatus, setQuickActionStatus] = useState('')
  const [quickActionNotes, setQuickActionNotes] = useState('')
  const [savingQuickAction, setSavingQuickAction] = useState(false)
  const [thumbnailTarget, setThumbnailTarget] = useState<AdminRequest | null>(null)
  const [savingThumbnail, setSavingThumbnail] = useState(false)
  const [reviewsByRequest, setReviewsByRequest] = useState<Record<string, RequestReview>>({})
  const [deletingReviewCommentId, setDeletingReviewCommentId] = useState<string | null>(null)
  const [sendingReviewInvitationId, setSendingReviewInvitationId] = useState<string | null>(null)
  const [showBulkReviewConfirm, setShowBulkReviewConfirm] = useState(false)
  const [sendingBulkReviewInvitations, setSendingBulkReviewInvitations] = useState(false)
  const [refundTarget, setRefundTarget] = useState<AdminRequest | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [processingRefund, setProcessingRefund] = useState(false)
  const [confirmingRefundId, setConfirmingRefundId] = useState<string | null>(null)
  const [resendingRefundId, setResendingRefundId] = useState<string | null>(null)
  const [refundsByRequest, setRefundsByRequest] = useState<Record<string, RefundRecord[]>>({})
  const [revivalTarget, setRevivalTarget] = useState<AdminRequest | null>(null)
  const [revivalDiscountPct, setRevivalDiscountPct] = useState(15)
  const [revivalValidDays, setRevivalValidDays] = useState(3)
  const [revivalMessage, setRevivalMessage] = useState('')
  const [sendingRevival, setSendingRevival] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  // نموذج إضافة طلب خارجي (نُشر ودُفع خارج المنصة)
  const [showExternalForm, setShowExternalForm] = useState(false)
  const [savingExternal, setSavingExternal] = useState(false)
  const [extName, setExtName] = useState('')
  const [extCategory, setExtCategory] = useState('')
  const [extAmount, setExtAmount] = useState('')
  const [extTitle, setExtTitle] = useState('')
  const [extDate, setExtDate] = useState('')
  const [extMode, setExtMode] = useState<'completed' | 'in_progress'>('completed')
  const [extContent, setExtContent] = useState('')
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({})
  // Removed drawer-related state since we now use full-page view

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    let summariesQuery = supabase
      .from('publish_requests')
      .select('id,user_id,client_name,client_email,client_phone,title,content,admin_notes,status,created_at,request_number,billing_source,membership_id,membership_credits,membership_credit_status,sub_option')
      // الطلب الذي ألغاه العميل لا يحتاج متابعة في لوحة الإدارة.
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
    summariesQuery = membershipOnly
      ? summariesQuery.eq('billing_source', 'membership')
      : summariesQuery.neq('billing_source', 'membership')
    const { data: summaries } = await summariesQuery

    const scopedSummaries = (summaries ?? []).filter(request => {
      const isStoreRequest = Boolean(getStoreRequestMeta(request))
      if (storeOnly) return isStoreRequest
      if (directOnly) return !isStoreRequest
      return true
    })
    setRequestSummaries(scopedSummaries)

    const reviewResponse = await fetch('/api/admin/request-reviews')
    if (reviewResponse.ok) {
      const reviewData = await reviewResponse.json().catch(() => ({ reviews: [] }))
      const reviews = Array.isArray(reviewData.reviews) ? reviewData.reviews as RequestReview[] : []
      const mapped = reviews.reduce((acc: Record<string, RequestReview>, review) => {
        acc[review.request_id] = review
        return acc
      }, {})
      setReviewsByRequest(mapped)
    }

    const refundsResponse = await fetch('/api/admin/refund')
    if (refundsResponse.ok) {
      const refundsData = await refundsResponse.json().catch(() => ({ refunds: [] }))
      const refunds = Array.isArray(refundsData.refunds) ? refundsData.refunds as RefundRecord[] : []
      const mapped = refunds.reduce((acc: Record<string, RefundRecord[]>, refund) => {
        acc[refund.request_id] = [...(acc[refund.request_id] ?? []), refund]
        return acc
      }, {})
      setRefundsByRequest(mapped)
    }
    setLoading(false)
  }, [supabase, router, membershipOnly, storeOnly, directOnly])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  // تبقى الفلاتر عند تحديث الصفحة، ويصبح الرابط نفسه قابلاً للمشاركة.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const setParam = (key: string, value: string) => {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    setParam('q', search.trim())
    setParam('status', statusFilter)
    setParam('service', storeOnly ? serviceFilter : '')
    setParam('user', userFilter)
    setParam('duplicates', duplicatesOnly ? '1' : '')
    setParam('page', currentPage > 1 ? String(currentPage) : '')
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [search, statusFilter, serviceFilter, storeOnly, userFilter, duplicatesOnly, currentPage])

  // Removed drawer useEffect

  // مفتاح هوية صاحب الطلب — user_id أولاً، وإلا البريد، وإلا الجوال.
  // نتجاهل القيم النائبة ('-' أو الفارغة) — مثل الطلبات الخارجية — ونعطيها
  // مفتاحاً فريداً لكل طلب حتى لا تُجمَّع طلبات أشخاص مختلفين معاً.
  const cleanId = (v: unknown): string => {
    const s = String(v ?? '').trim().toLowerCase()
    return s && s !== '-' ? s : ''
  }
  const ownerKey = (r: AdminRequest): string =>
    r.user_id || cleanId(r.client_email) || cleanId(r.client_phone) || `req:${r.id}`

  // عدد طلبات كل مستخدم (لتحديد المكررين وعرض الشارة)
  const requestCountByOwner = requestSummaries.reduce((acc: Record<string, number>, r) => {
    const key = ownerKey(r)
    if (key) acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const isDuplicate = (r: AdminRequest): boolean => {
    const key = ownerKey(r)
    return !!key && (requestCountByOwner[key] ?? 0) > 1
  }

  // قائمة المستخدمين الفريدة الذين لديهم طلبات (للفلتر بالاسم)
  const usersList = (() => {
    const map = new Map<string, { key: string; name: string; email: string; count: number }>()
    for (const r of requestSummaries) {
      const key = ownerKey(r)
      if (!key) continue
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
      } else {
        map.set(key, {
          key,
          name: r.client_name || r.client_email || r.client_phone || '—',
          email: r.client_email || '',
          count: 1,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  })()

  // قائمة المستخدمين بعد تطبيق نص البحث داخل القائمة
  const filteredUsersList = userQuery.trim()
    ? usersList.filter(u => {
        const q = userQuery.trim().toLowerCase()
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      })
    : usersList

  const selectedUserName = userFilter
    ? (usersList.find(u => u.key === userFilter)?.name ?? '')
    : ''

  const filteredRequestSummaries = requestSummaries
    .filter(r => {
      if (userFilter && ownerKey(r) !== userFilter) return false
      if (duplicatesOnly && !isDuplicate(r)) return false
      if (statusFilter && r.status !== statusFilter) return false
      if (storeOnly && serviceFilter && getStoreRequestMeta(r)?.product_slug !== serviceFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          r.client_name?.toLowerCase().includes(q) ||
          r.client_email?.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q) ||
          r.content?.toLowerCase().includes(q) ||
          r.admin_notes?.toLowerCase().includes(q) ||
          formatRequestNumber(r.request_number).toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const totalPages = Math.max(1, Math.ceil(filteredRequestSummaries.length / REQUESTS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageRequestIds = filteredRequestSummaries
    .slice((safeCurrentPage - 1) * REQUESTS_PER_PAGE, safeCurrentPage * REQUESTS_PER_PAGE)
    .map(request => request.id)
  const pageRequestIdsKey = pageRequestIds.join('|')

  useEffect(() => {
    const loadPage = async () => {
      const requestIds = pageRequestIdsKey ? pageRequestIdsKey.split('|') : []
      if (loading) return
      if (requestIds.length === 0) {
        setRequests([])
        return
      }

      setPageLoading(true)
      const { data, error } = await supabase
        .from('publish_requests')
        .select('*')
        .in('id', requestIds)

      if (!error) {
        const requestsById = new Map((data ?? []).map(request => [request.id, request]))
        setRequests(requestIds.map(id => requestsById.get(id)).filter((request): request is AdminRequest => Boolean(request)))
      }
      setPageLoading(false)
    }

    loadPage()
  }, [loading, supabase, pageRequestIdsKey])

  const filteredRequests = requests

  // عدد المستخدمين الذين لديهم أكثر من طلب (لعرضه على زر الفلتر)
  const duplicateOwnersCount = Object.values(requestCountByOwner).filter(c => c > 1).length

  // قطع المحتوى لعرض جزء منه فقط
  const truncateContent = (text: string, maxLength: number = 60) => {
    if (!text) return ''
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  // The admin can choose one existing request image for the card without changing source images.
  const getRequestThumbnail = (request: AdminRequest): string | null => {
    const images = request.content_images
    if (!Array.isArray(images)) return null

    if (typeof request.admin_thumbnail_url === 'string' && images.includes(request.admin_thumbnail_url)) {
      return request.admin_thumbnail_url
    }

    const imageUrl = images.find((image: unknown): image is string =>
      typeof image === 'string' && image.trim().length > 0
    )

    return imageUrl?.trim() ?? null
  }

  const selectThumbnail = async (imageUrl: string) => {
    if (!thumbnailTarget) return
    setSavingThumbnail(true)
    try {
      const response = await fetch('/api/admin/request-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: thumbnailTarget.id, imageUrl }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر حفظ الصورة المصغرة', 'error')
        return
      }
      setRequests(current => current.map(request => request.id === thumbnailTarget.id ? { ...request, admin_thumbnail_url: data.imageUrl } : request))
      setThumbnailTarget(null)
      showToast('تم اختيار الصورة المصغرة للطلب')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSavingThumbnail(false)
    }
  }

  const sendReviewInvitation = async (request: AdminRequest) => {
    setSendingReviewInvitationId(request.id)
    try {
      const response = await fetch('/api/admin/request-review-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر إرسال دعوة التقييم', 'error')
        return
      }
      setReviewsByRequest(current => ({
        ...current,
        [request.id]: { ...(current[request.id] ?? {}), invitation_sent_at: new Date().toISOString() },
      }))
      showToast('تم إرسال رابط التقييم للعميل')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSendingReviewInvitationId(null)
    }
  }

  const deleteReviewComment = async (requestId: string) => {
    if (!confirm('هل تريد حذف تعليق العميل؟ سيبقى تقييم النجوم محفوظاً.')) return
    setDeletingReviewCommentId(requestId)
    try {
      const response = await fetch('/api/admin/request-reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر حذف التعليق', 'error')
        return
      }
      setReviewsByRequest(current => ({
        ...current,
        [requestId]: { ...(current[requestId] ?? { request_id: requestId }), comment: null },
      }))
      showToast('تم حذف التعليق مع الاحتفاظ بالتقييم')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setDeletingReviewCommentId(null)
    }
  }

  const openRefund = (request: AdminRequest) => {
    const completedRefunds = (refundsByRequest[request.id] ?? []).filter(refund => refund.status === 'completed')
    const paidAmount = Number(request.final_total ?? request.admin_quoted_price ?? 0)
    const refundedAmount = completedRefunds.reduce((total, refund) => total + Number(refund.amount), 0)
    const remaining = Math.max(0, Math.round((paidAmount - refundedAmount) * 100) / 100)
    setRefundTarget({ ...request, remainingRefundAmount: remaining })
    setRefundAmount(String(remaining))
    setRefundReason('')
  }

  const submitRefund = async () => {
    if (!refundTarget) return
    const amount = Number(refundAmount)
    const remainingRefundAmount = refundTarget.remainingRefundAmount ?? 0
    if (!Number.isFinite(amount) || amount <= 0 || amount > remainingRefundAmount + 0.001) {
      showToast('أدخل مبلغاً ضمن الرصيد القابل للاسترجاع', 'error')
      return
    }
    if (refundReason.trim().length < 3) {
      showToast('اكتب سبب الاسترجاع', 'error')
      return
    }
    const provider = refundTarget.moyasar_payment_id ? 'moyasar' : refundTarget.tamara_order_id ? 'tamara' : 'manual'
    setProcessingRefund(true)
    try {
      const response = await fetch('/api/admin/refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: refundTarget.id, provider, amount, reason: refundReason.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر تنفيذ الاسترجاع', 'error')
        return
      }
      showToast('تم رفع طلب الاسترجاع وإشعار العميل بأنه قيد المعالجة')
      setRefundTarget(null)
      await loadData()
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setProcessingRefund(false)
    }
  }

  const confirmManualRefund = async (refund: RefundRecord) => {
    if (!window.confirm('هل تؤكد تنفيذ التحويل البنكي للاسترجاع؟ سيُشعر العميل بإتمام الاسترجاع.')) return
    setConfirmingRefundId(refund.id)
    try {
      const response = await fetch(`/api/admin/refund/${refund.id}/complete`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر تأكيد التحويل', 'error')
        return
      }
      showToast('تم تأكيد تحويل مبلغ الاسترجاع وإشعار العميل')
      await loadData()
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setConfirmingRefundId(null)
    }
  }

  const resendRefundRequestEmail = async (refund: RefundRecord) => {
    setResendingRefundId(refund.id)
    try {
      const response = await fetch(`/api/admin/refund/${refund.id}/resend-request`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر إرسال إشعار الاسترجاع', 'error')
        return
      }
      showToast('تم إرسال إشعار طلب الاسترجاع للعميل')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setResendingRefundId(null)
    }
  }

  const openRequest = (req: AdminRequest) => {
    router.push(storeOnly ? `/admin/inventor-store-requests/${req.id}` : `/admin/requests/${req.id}`)
  }

  // Removed drawer handler functions - now using full-page view

  const handleExport = () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    params.set('scope', scope)
    if (storeOnly && serviceFilter) params.set('service', serviceFilter)
    window.open(`/api/export-csv?${params.toString()}`)
  }

  const handleDeleteClick = (request: AdminRequest, event: React.MouseEvent) => {
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
        showToast(`تم حذف طلب ${formatRequestNumber(requestToDelete.request_number)} نهائياً`, 'success')
        // إزالة الطلب من القائمة
        setRequests(prev => prev.filter(r => r.id !== requestToDelete.id))
        setRequestSummaries(prev => prev.filter(r => r.id !== requestToDelete.id))
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

  const openQuickNote = (request: AdminRequest, event: React.MouseEvent) => {
    event.stopPropagation()
    setQuickNoteTarget(request)
    setQuickNote(request.admin_notes ?? '')
  }

  const quickActionLabel = (currentStatus: string, nextStatus: string, billingSource?: string | null) => {
    if (nextStatus === REFUND_QUICK_ACTION) return 'استرجاع مبلغ'
    if (billingSource === 'membership' && currentStatus === 'pending' && nextStatus === 'in_progress') return 'قبول الطلب وبدء التنفيذ'
    if (billingSource === 'membership' && currentStatus === 'pending' && nextStatus === 'rejected') return 'رفض الطلب وإعادة الرصيد'
    if (nextStatus === 'suspended') return 'تعليق الطلب'
    if (nextStatus === 'resume') return 'استئناف الطلب'
    if (currentStatus === 'approved' && nextStatus === 'paid') return 'تأكيد الدفع'
    if (currentStatus === 'payment_review' && nextStatus === 'in_progress') return 'تأكيد الدفع وبدء التنفيذ'
    if (currentStatus === 'paid' && nextStatus === 'in_progress') return 'بدء التنفيذ'
    return REQUEST_STATUSES[nextStatus as keyof typeof REQUEST_STATUSES]?.label ?? nextStatus
  }

  const canRefundRequest = (request: AdminRequest) => {
    const refunds = refundsByRequest[request.id] ?? []
    const hasPendingRefund = refunds.some(refund => refund.status === 'pending')
    const completedRefundAmount = refunds
      .filter(refund => refund.status === 'completed')
      .reduce((total, refund) => total + Number(refund.amount), 0)
    const paidAmount = Number(request.final_total ?? request.admin_quoted_price ?? 0)
    const isPaid = Boolean(request.payment_status === 'paid' || request.paid_at || request.moyasar_payment_id || request.tamara_order_id)

    return !hasPendingRefund && isPaid && request.status !== 'refunded' && completedRefundAmount < paidAmount
  }

  const quickActionsFor = (request: AdminRequest) => {
    const actions = quickStatusTransitionsFor(request.status, request.billing_source)
    return canRefundRequest(request) ? [...actions, REFUND_QUICK_ACTION] : actions
  }

  const openQuickAction = (request: AdminRequest, event: React.MouseEvent) => {
    event.stopPropagation()
    const options = quickActionsFor(request)
    setQuickActionTarget(request)
    setQuickActionStatus(options[0] ?? '')
    setQuickActionNotes(request.admin_notes ?? '')
  }

  const handleQuickAction = async () => {
    if (!quickActionTarget || !quickActionStatus) return
    if (quickActionStatus === REFUND_QUICK_ACTION) {
      const request = quickActionTarget
      setQuickActionTarget(null)
      setQuickActionStatus('')
      setQuickActionNotes('')
      openRefund(request)
      return
    }
    setSavingQuickAction(true)
    try {
      const response = await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: quickActionTarget.id,
          status: quickActionStatus,
          adminNotes: quickActionNotes.trim() || null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر تنفيذ الإجراء', 'error')
        return
      }

      showToast(`تم ${quickActionLabel(quickActionTarget.status, quickActionStatus, quickActionTarget.billing_source)} بنجاح`)
      setQuickActionTarget(null)
      setQuickActionStatus('')
      setQuickActionNotes('')
      await loadData()
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSavingQuickAction(false)
    }
  }

  const handleSaveQuickNote = async () => {
    if (!quickNoteTarget) return
    setSavingQuickNote(true)
    try {
      const response = await fetch('/api/admin/request-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: quickNoteTarget.id, adminNotes: quickNote }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر حفظ ملاحظة الإدارة', 'error')
        return
      }
      setRequests(current => current.map(request => request.id === quickNoteTarget.id
        ? { ...request, admin_notes: data.adminNotes }
        : request))
      setRequestSummaries(current => current.map(request => request.id === quickNoteTarget.id
        ? { ...request, admin_notes: data.adminNotes }
        : request))
      showToast(quickNote.trim() ? 'تم حفظ الملاحظة وتظهر الآن في بطاقة الطلب' : 'تم حذف ملاحظة الإدارة')
      setQuickNoteTarget(null)
      setQuickNote('')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSavingQuickNote(false)
    }
  }

  const openRevival = (request: AdminRequest, event: React.MouseEvent) => {
    event.stopPropagation()
    const currentPrice = Number(request.final_total ?? request.admin_quoted_price ?? 0)
    setRevivalTarget(request)
    setRevivalDiscountPct(15)
    setRevivalValidDays(3)
    setRevivalMessage(currentPrice > 0
      ? 'يسرّنا إعادة فتح طلبك السابق بعرض عودة خاص، ويمكنك استكماله مباشرة من الرابط.'
      : 'يسرّنا إعادة فتح طلبك السابق، ويمكنك استكماله مباشرة من الرابط.')
  }

  const handleReviveRequest = async () => {
    if (!revivalTarget) return
    if (revivalDiscountPct < 0 || revivalDiscountPct >= 100) {
      showToast('نسبة الخصم يجب أن تكون بين 0 و99', 'error')
      return
    }
    if (!Number.isInteger(revivalValidDays) || revivalValidDays < 1 || revivalValidDays > 30) {
      showToast('مدة العرض يجب أن تكون من يوم إلى 30 يوماً', 'error')
      return
    }

    setSendingRevival(true)
    try {
      const response = await fetch('/api/admin/revive-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: revivalTarget.id,
          discountPct: revivalDiscountPct,
          validDays: revivalValidDays,
          message: revivalMessage,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر إرسال عرض الإحياء', 'error')
        return
      }

      setRequests(current => current.map(request => request.id === revivalTarget.id ? data.request : request))
      setRequestSummaries(current => current.map(request => request.id === revivalTarget.id
        ? { ...request, status: data.request.status }
        : request))
      showToast(data.emailSent ? 'تم إحياء الطلب وإرسال عرض العودة للعميل' : 'تم إحياء الطلب، لكن تعذّر إرسال البريد', data.emailSent ? 'success' : 'error')
      setRevivalTarget(null)
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSendingRevival(false)
    }
  }

  const quotedCount = requestSummaries.filter(r => r.status === 'quoted').length
  const autoClosedCount = requestSummaries.filter(r => r.status === 'auto_closed').length
  const quickStatusFilters = [
    { status: 'in_progress', label: 'قيد التنفيذ', className: 'border-orange-200 bg-orange-50 text-orange-700' },
    { status: 'pending', label: 'تحت المراجعة', className: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
    { status: 'negotiation', label: 'تفاوض على السعر', className: 'border-rose-200 bg-rose-50 text-rose-700' },
    { status: 'payment_review', label: 'بانتظار تحقق الدفع', className: 'border-amber-200 bg-amber-50 text-amber-800' },
    { status: 'content_review', label: 'مراجعة المحتوى', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
    { status: 'changes_requested', label: 'العميل طلب تعديلات', className: 'border-purple-200 bg-purple-50 text-purple-700' },
    { status: 'scheduled', label: 'مجدول للنشر', className: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  ].map(filter => ({ ...filter, count: requestSummaries.filter(request => request.status === filter.status).length }))

  const handleBulkReminder = async () => {
    if (bulkApplyDiscount && (bulkDiscountPct <= 0 || bulkDiscountPct >= 100)) {
      showToast('نسبة الخصم يجب أن تكون بين 1 و 99', 'error')
      return
    }
    setSendingBulkReminder(true)
    try {
      const response = await fetch('/api/admin/bulk-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'quoted',
          discountPct: bulkApplyDiscount ? bulkDiscountPct : null,
        })
      })
      const data = await response.json()
      if (response.ok && data.success) {
        const parts = [`تم إرسال ${data.sent} تذكير`]
        if (data.priceUpdated > 0) parts.push(`تحديث ${data.priceUpdated} سعر`)
        if (data.failed > 0) parts.push(`فشل ${data.failed}`)
        if (data.skipped > 0) parts.push(`تخطي ${data.skipped}`)
        // success: all sent  /  info: partial  /  error: none sent
        const toastType: 'success' | 'error' | 'info' =
          data.sent === 0 ? 'error' : (data.failed > 0 ? 'info' : 'success')
        showToast(parts.join(' • '), toastType)
        // Refresh list if prices were updated
        if (data.priceUpdated > 0) loadData()
      } else {
        showToast(data.error || 'فشل الإرسال الجماعي', 'error')
      }
    } catch (error) {
      console.error('Bulk reminder error:', error)
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSendingBulkReminder(false)
      setShowBulkConfirm(false)
      setBulkApplyDiscount(false)
    }
  }

  const handleBulkReviewInvitations = async () => {
    setSendingBulkReviewInvitations(true)
    try {
      const response = await fetch('/api/admin/bulk-request-review-invitations', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        showToast(data.error ?? 'تعذّر إرسال دعوات التقييم', 'error')
        return
      }
      const parts = [`تم إرسال ${data.sent} دعوة تقييم`]
      if (data.skipped) parts.push(`تخطي ${data.skipped} تقييم مكتمل`)
      if (data.failed) parts.push(`فشل ${data.failed}`)
      showToast(parts.join(' • '), data.failed ? 'info' : 'success')
      await loadData()
      setShowBulkReviewConfirm(false)
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSendingBulkReviewInvitations(false)
    }
  }

  const handleSendReminder = (request: AdminRequest, event: React.MouseEvent) => {
    event.stopPropagation() // منع فتح صفحة الطلب
    setSingleApplyDiscount(false)
    setSingleDiscountPct(10)
    setReminderTarget(request)
  }

  // هل طُبِّق خصم على هذا الطلب؟ (تُحدِّد نوع رسالة الواتساب)
  const hasDiscount = (request: AdminRequest) => Boolean(request.offer_discount_sent_at)

  // تطبيع رقم الجوال إلى صيغة دولية بدون رمز '+' (افتراضي السعودية 966)
  const normalizePhone = (raw: string) => {
    let p = (raw || '').replace(/[^\d+]/g, '')
    if (p.startsWith('+')) {
      p = p.slice(1)
    } else if (p.startsWith('00')) {
      p = p.slice(2)
    } else if (p.startsWith('0')) {
      p = '966' + p.slice(1)
    }
    return p
  }

  // نص رسالة الخصم عبر واتساب — يطابق محتوى قالب البريد quotedDiscountTemplate
  const buildDiscountWhatsAppMessage = (request: AdminRequest) => {
    const clientName = request.client_name || 'عزيزنا'
    const requestNumber = formatRequestNumber(request.request_number)
    const oldPrice = Number(request.offer_original_price ?? request.admin_quoted_price ?? 0)
    const newPrice = Number(request.final_total ?? request.admin_quoted_price ?? 0)
    const discountPct = request.offer_discount_pct != null
      ? Number(request.offer_discount_pct)
      : (oldPrice > 0 ? Math.round((1 - newPrice / oldPrice) * 100) : 0)
    const savings = Math.max(oldPrice - newPrice, 0)

    return [
      `مرحباً ${clientName}،`,
      '',
      `🎯 خصصنا لك خصماً ${discountPct}% على عرض طلبك ${requestNumber}.`,
      '',
      `السعر القديم: ${oldPrice.toLocaleString('ar-SA')} ر.س`,
      `السعر بعد الخصم: ${newPrice.toLocaleString('ar-SA')} ر.س`,
      `توفير ${savings.toLocaleString('ar-SA')} ر.س`,
      '',
      'فرصة محدودة — راجع العرض المحدّث واعتمده الآن.',
      '',
      'مع تحيات فريق تواصل النخبة',
    ].join('\n')
  }

  // رسالة عامة عند عدم وجود خصم مُطبَّق على الطلب
  const buildGeneralWhatsAppMessage = (request: AdminRequest) => {
    const clientName = request.client_name || 'عزيزنا'
    const requestNumber = formatRequestNumber(request.request_number)

    return [
      `مرحباً ${clientName}،`,
      '',
      `نتواصل معك بخصوص طلبك ${requestNumber} لدى تواصل النخبة.`,
      '',
      'نسعد بخدمتك والإجابة عن أي استفسار لديك.',
      '',
      'مع تحيات فريق تواصل النخبة',
    ].join('\n')
  }

  const handleWhatsApp = (request: AdminRequest, event: React.MouseEvent) => {
    event.stopPropagation() // منع فتح صفحة الطلب
    const normalizedPhone = normalizePhone(
      request.client_phone ?? request.phone ?? request.client_mobile ?? ''
    )
    if (!normalizedPhone) {
      showToast('لا يوجد رقم جوال لهذا المستخدم', 'error')
      return
    }
    // رسالة الخصم إن وُجد خصم مُطبَّق، وإلا رسالة عامة
    const message = hasDiscount(request)
      ? buildDiscountWhatsAppMessage(request)
      : buildGeneralWhatsAppMessage(request)
    window.open(
      `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`,
      '_blank'
    )
  }

  const handleConfirmSingleReminder = async () => {
    if (!reminderTarget) return
    const request = reminderTarget
    const willApplyDiscount = singleApplyDiscount && request.status === 'quoted'
    if (willApplyDiscount && (singleDiscountPct <= 0 || singleDiscountPct >= 100)) {
      showToast('نسبة الخصم يجب أن تكون بين 1 و 99', 'error')
      return
    }

    setSendingReminderId(request.id)
    try {
      const response = await fetch('/api/admin/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          reminderType: request.status,
          discountPct: willApplyDiscount ? singleDiscountPct : null,
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const requestNum = formatRequestNumber(request.request_number)
        if (data.priceUpdated) {
          showToast(`تم إرسال خصم ${singleDiscountPct}% لطلب ${requestNum} وتحديث السعر`, 'success')
          loadData() // refresh prices
        } else {
          showToast(`تم إرسال تذكير لطلب ${requestNum} بنجاح`, 'success')
        }
        setReminderTarget(null)
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

  const resetExternalForm = () => {
    setExtName(''); setExtCategory(''); setExtAmount(''); setExtTitle(''); setExtDate('')
    setExtMode('completed'); setExtContent('')
  }

  const handleSaveExternal = async () => {
    if (!extName.trim()) { showToast('أدخل اسم العميل', 'error'); return }
    if (!extCategory) { showToast('اختر الفئة', 'error'); return }
    const amount = parseFloat(extAmount)
    if (!Number.isFinite(amount) || amount < 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return }
    if (extMode === 'in_progress') {
      if (!extTitle.trim()) { showToast('أدخل عنوان الخبر', 'error'); return }
      if (!extContent.trim()) { showToast('أدخل تفاصيل/نص الخبر', 'error'); return }
    }

    setSavingExternal(true)
    try {
      const res = await fetch('/api/admin/external-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: extName.trim(),
          category: extCategory,
          amount,
          title: extTitle.trim() || null,
          content: extContent.trim() || null,
          paidAt: extDate || null,
          mode: extMode,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        showToast('تم تسجيل الطلب الخارجي بنجاح', 'success')
        setShowExternalForm(false)
        const goToRequest = extMode === 'in_progress' && data.id
        resetExternalForm()
        if (goToRequest) router.push(`/admin/requests/${data.id}`)
        else loadData()
      } else {
        showToast(data.error || 'فشل تسجيل الطلب', 'error')
      }
    } catch (error) {
      console.error('External request error:', error)
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSavingExternal(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-black text-dark">{storeOnly ? 'طلبات مسار المخترع' : membershipOnly ? 'طلبات الأعضاء' : 'إدارة الطلبات'}</h1><p className="mt-1 text-sm text-muted">{storeOnly ? 'راجع طلبات الخدمات الرقمية للمخترعين وأرسل العرض المناسب قبل الدفع.' : membershipOnly ? 'راجع طلبات النشر المقدمة من أرصدة العضويات واتخذ إجراء التنفيذ.' : 'تابع الطلبات المباشرة، تواصل مع العملاء، وراجع تفاصيل التنفيذ.'}</p></div>
        <span className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-muted">{requestSummaries.length} {storeOnly ? 'طلب متجر' : membershipOnly ? 'طلب عضوية' : 'طلب نشط'}</span>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="بحث بالاسم أو رقم الطلب..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            className="w-full sm:w-72"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            className="min-h-[48px] rounded-lg border border-border bg-card px-4 py-2 text-sm"
          >
            <option value="">جميع الحالات</option>
            {Object.entries(REQUEST_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {storeOnly && <select
            value={serviceFilter}
            onChange={e => { setServiceFilter(e.target.value); setCurrentPage(1) }}
            className="min-h-[48px] max-w-full rounded-lg border border-border bg-card px-4 py-2 text-sm sm:max-w-64"
            aria-label="فلترة حسب خدمة مسار المخترع"
          >
            <option value="">جميع خدمات المسار</option>
            {INVENTOR_STORE_PRODUCTS.map(product => <option key={product.slug} value={product.slug}>{product.name}</option>)}
          </select>}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(value => !value)}
            className={`min-h-[48px] rounded-lg border px-4 text-sm font-bold transition-colors ${showAdvancedFilters || userFilter || duplicatesOnly ? 'border-green bg-green/5 text-green' : 'border-border bg-white text-dark hover:bg-cream'}`}
          >
            ⚙️ فلاتر إضافية
            {(userFilter || duplicatesOnly) && <span className="mr-2 rounded-full bg-green px-1.5 py-0.5 text-[10px] text-white">مفعلة</span>}
          </button>
          {directOnly && <Button onClick={() => setShowExternalForm(true)} className="bg-green-600 hover:bg-green-700">
            ➕ تسجيل طلب خارجي
          </Button>}
          <button
            type="button"
            onClick={handleExport}
            title="تصدير CSV"
            aria-label="تصدير CSV"
            className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg border border-border px-3 text-lg text-dark transition-colors hover:bg-cream"
          >
            ⇩
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/studio')}
            title="استوديو الذكاء الاصطناعي"
            aria-label="استوديو الذكاء الاصطناعي"
            className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg border border-green px-3 text-lg text-green transition-colors hover:bg-green/5"
          >
            🤖
          </button>
          {directOnly && <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkConfirm(true)}
              disabled={quotedCount === 0}
              className="min-h-[34px] shrink-0 whitespace-nowrap border-orange-300 px-2 py-1 text-xs text-orange-700 hover:bg-orange-50 disabled:opacity-50"
              title={`تذكير العروض (${quotedCount})`}
            >
              🔔 تذكير ({quotedCount})
            </Button>
            <button
              type="button"
              onClick={() => setShowBulkReviewConfirm(true)}
              title="إرسال طلب تقييم للطلبات المكتملة"
              aria-label="إرسال طلب تقييم للطلبات المكتملة"
              className="inline-flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg border border-gold/50 bg-gold/10 px-2 text-base text-gold transition hover:bg-gold/20"
            >
              ★
            </button>
          </>}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto border-t border-border pt-3" aria-label="فلاتر الإجراءات السريعة">
          {quickStatusFilters.map(filter => {
            const active = statusFilter === filter.status
            return (
              <button
                key={filter.status}
                type="button"
                onClick={() => { setStatusFilter(active ? '' : filter.status); setCurrentPage(1) }}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${active ? 'border-dark bg-dark text-white shadow-sm' : `${filter.className} hover:brightness-95`}`}
                aria-pressed={active}
              >
                {filter.label} <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white/70'}`}>{filter.count}</span>
              </button>
            )
          })}
        </div>

        {showAdvancedFilters && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-[minmax(0,280px)_auto_auto_auto] md:items-center">
            <div className="relative">
              <input
                type="text"
                value={userFilter ? selectedUserName : userQuery}
                onChange={e => { setUserFilter(''); setUserQuery(e.target.value); setShowUserList(true); setCurrentPage(1) }}
                onFocus={() => setShowUserList(true)}
                onBlur={() => setTimeout(() => setShowUserList(false), 150)}
                placeholder={`👤 فلترة بالمستخدم (${usersList.length})`}
                className="min-h-[48px] w-full rounded-lg border border-border bg-card px-4 py-2 text-sm"
              />
              {userFilter && (
                <button
                  onClick={() => { setUserFilter(''); setUserQuery(''); setCurrentPage(1) }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted hover:text-red-600"
                  title="مسح فلتر المستخدم"
                  aria-label="مسح فلتر المستخدم"
                >
                  ✕
                </button>
              )}
              {showUserList && (
                <div className="absolute right-0 z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                  {filteredUsersList.length === 0 ? (
                    <div className="px-4 py-3 text-center text-xs text-muted">لا يوجد مستخدمون مطابقون</div>
                  ) : (
                    filteredUsersList.map(u => (
                      <button
                        key={u.key}
                        onMouseDown={() => { setUserFilter(u.key); setUserQuery(''); setShowUserList(false); setCurrentPage(1) }}
                        className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5 text-right transition-colors last:border-0 hover:bg-cream/60"
                      >
                        <span className="truncate text-sm font-medium text-dark">{u.name}</span>
                        <span className="shrink-0 rounded-md bg-cream px-1.5 py-0.5 text-[10px] text-muted">{u.count} طلب</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => { setDuplicatesOnly(value => !value); setCurrentPage(1) }}
              disabled={!duplicatesOnly && duplicateOwnersCount === 0}
              className={duplicatesOnly
                ? 'border-purple-400 bg-purple-50 text-purple-700'
                : 'border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50'}
            >
              👥 {duplicatesOnly ? 'إلغاء فلتر المكرر' : `الطلبات المكررة (${duplicateOwnersCount})`}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setStatusFilter(statusFilter === 'auto_closed' ? '' : 'auto_closed'); setCurrentPage(1) }}
              disabled={!autoClosedCount && statusFilter !== 'auto_closed'}
              className={statusFilter === 'auto_closed'
                ? 'border-slate-500 bg-slate-100 text-slate-700'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50'}
            >
              ⏱️ أُغلقت تلقائياً ({autoClosedCount})
            </Button>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="justify-self-start rounded-lg bg-yellow-100 px-3 py-2 text-xs font-bold text-yellow-700 hover:bg-yellow-200"
            >
              {showDebug ? 'إخفاء' : 'إظهار'} التشخيص
            </button>
          </div>
        )}

        <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
          إجمالي {requestSummaries.length} · ظاهر {filteredRequestSummaries.length}
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <h3 className="font-bold text-yellow-700 mb-2">🔍 معلومات التشخيص</h3>
            <div className="text-xs text-yellow-600 space-y-1">
              <div>إجمالي الطلبات: {requestSummaries.length}</div>
              <div>الطلبات المفلترة: {filteredRequestSummaries.length}</div>
              <div>حالة البحث: «{search || 'فارغ'}»</div>
              <div>فلتر الحالة: «{statusFilter || 'جميع الحالات'}»</div>
              {filteredRequestSummaries.length > 0 && (
                <div>عينة من البيانات: {JSON.stringify({
                  id: filteredRequestSummaries[0]?.id?.substring(0, 8),
                  client_email: filteredRequestSummaries[0]?.client_email ? 'موجود' : 'مفقود',
                  status: filteredRequestSummaries[0]?.status
                })}</div>
              )}
            </div>
          </div>

          {/* Name Display Test */}
          {filteredRequestSummaries.length > 0 && (
            <NameDisplayTest
              names={filteredRequestSummaries
                .slice(0, 3)
                .map(r => r.client_name)
                .filter((name): name is string => Boolean(name))}
            />
          )}
        </>
      )}

      <div className="space-y-3" dir="rtl">
          {pageLoading && <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted">جارٍ تحميل الطلبات...</div>}
          {!pageLoading && filteredRequests.map(r => {
            const cat = CATEGORIES.find(c => c.id === r.category)
            const selectedPackage = PACKAGES.find(pkg => pkg.id === (r.auto_quote_tier ?? r.selected_package))
            const total = r.final_total ?? r.admin_quoted_price
            const expanded = !!expandedRequests[r.id]
            const thumbnailUrl = getRequestThumbnail(r)
            const review = reviewsByRequest[r.id]
            const refunds = refundsByRequest[r.id] ?? []
            const completedRefundAmount = refunds.filter(refund => refund.status === 'completed').reduce((total, refund) => total + Number(refund.amount), 0)
            const hasRefund = refunds.length > 0
            const pendingRefund = refunds.find(refund => refund.status === 'pending')
            const pendingManualRefund = pendingRefund?.provider === 'manual' ? pendingRefund : null
            const quickActions = quickActionsFor(r)
            return (
              <article key={r.id} className="rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-muted">{formatRequestNumber(r.request_number)}</span>
                      <StatusBadge status={r.status} userRole="admin" emphasizeCompleted />
                      {membershipOnly && <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-dark">طلب من رصيد العضوية</span>}
                      {storeOnly && <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-800">طلب من مسار المخترع</span>}
                      {r.is_external && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">خارجي</span>}
                    </div>
                    <button type="button" onClick={() => openRequest(r)} className="mt-2 block text-right text-sm font-black leading-6 text-dark hover:text-green sm:text-base">{r.title || 'طلب بدون عنوان'}</button>
                    {r.content && <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{truncateContent(r.content, 150)}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
                      {cat && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{cat.icon} {cat.nameAr}</span>}
                      {selectedPackage && <span className="rounded-full border border-green/20 bg-green/10 px-2.5 py-1 text-green">{selectedPackage.name}</span>}
                      {isDuplicate(r) && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">{requestCountByOwner[ownerKey(r)]} طلبات لنفس العميل</span>}
                      {r.status === 'completed' && review?.rating && <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-gold">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} تقييم العميل</span>}
                      {r.status === 'completed' && !review?.rating && review?.invitation_sent_at && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">بانتظار تقييم العميل</span>}
                      {r.status === 'completed' && !review?.rating && !review?.invitation_sent_at && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">التقييم: لم يُرسل</span>}
                      {hasRefund && <span className={`rounded-full px-2.5 py-1 ${pendingRefund ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>{pendingRefund ? 'استرجاع قيد المعالجة' : `مسترجع ${formatNumber(completedRefundAmount)} ر.س`}</span>}
                      {r.refund_timing && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">مدة الاسترجاع: {r.refund_timing}</span>}
                      {membershipOnly && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-800">الرصيد: {r.membership_credit_status === 'reserved' ? 'محجوز' : r.membership_credit_status === 'consumed' ? 'مستخدم' : r.membership_credit_status === 'released' ? 'مُعاد' : 'غير مخصوم'}</span>}
                      {storeOnly && getStoreRequestMeta(r) && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">{getStoreRequestMeta(r)?.product_name} · {formatNumber(Number(getStoreRequestMeta(r)?.listed_price || 0))} ر.س معلن</span>}
                    </div>
                    {r.status === 'completed' && review?.comment && <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs leading-5 text-dark"><p className="min-w-0"><span className="font-black text-gold">رأي العميل: </span>{review.comment}</p><button type="button" onClick={() => deleteReviewComment(r.id)} disabled={deletingReviewCommentId === r.id} className="shrink-0 rounded-md px-2 py-1 font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50">{deletingReviewCommentId === r.id ? 'جارٍ الحذف...' : 'حذف التعليق'}</button></div>}
                    {r.admin_notes?.trim() && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"><span className="font-black">ملاحظة الإدارة: </span>{r.admin_notes.trim()}</div>}
                  </div>

                  <div className="border-t border-border pt-3 lg:border-r lg:border-t-0 lg:pr-4 lg:pt-0">
                    {thumbnailUrl && (
                      <div className="relative mb-3 h-28 overflow-hidden rounded-lg border border-border bg-cream/50 p-2">
                        <a
                          href={thumbnailUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-full w-full items-center justify-center"
                          title="عرض الصورة المرفقة"
                        >
                          <Image
                            src={thumbnailUrl}
                            alt={`صورة مرفقة للطلب ${formatRequestNumber(r.request_number)}`}
                            fill
                            unoptimized
                            sizes="(max-width: 1024px) 100vw, 280px"
                            className="object-contain"
                          />
                        </a>
                        {Array.isArray(r.content_images) && r.content_images.filter((image: unknown) => typeof image === 'string' && !!image.trim()).length > 1 && (
                          <button
                            type="button"
                            onClick={() => setThumbnailTarget(r)}
                            className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/95 text-sm text-dark shadow-sm transition hover:bg-green hover:text-white"
                            title="اختيار صورة مصغرة أخرى"
                            aria-label="اختيار صورة مصغرة أخرى"
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    )}
                    {Array.isArray(r.content_images) && r.content_images.filter((image: unknown) => typeof image === 'string' && !!image.trim()).length > 1 && (
                      !thumbnailUrl && <button type="button" onClick={() => setThumbnailTarget(r)} className="mb-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold text-dark transition-colors hover:border-green hover:bg-green/5">اختيار صورة</button>
                    )}
                    <ClientNameFixed name={r.client_name || 'عميل بدون اسم'} maxLength={32} className="block text-sm font-bold text-dark" />
                    {r.client_email && <p className="mt-1 truncate text-xs text-muted" dir="ltr">{r.client_email}</p>}
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div><p className="text-[10px] font-bold text-muted">إجمالي الطلب</p><p className="mt-0.5 text-base font-black text-dark">{total != null ? `${formatNumber(total)} ر.س` : '—'}</p></div>
                      <p className="text-left text-[11px] leading-5 text-muted">{formatDate(r.created_at)}</p>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 grid gap-3 border-t border-border pt-4 text-xs leading-5 text-muted sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="font-bold text-dark">بيانات التواصل</p><p className="mt-1" dir="ltr">{r.client_phone || 'لا يوجد جوال'}</p><p className="truncate" dir="ltr">{r.client_email || 'لا يوجد بريد'}</p></div>
                    <div><p className="font-bold text-dark">مميزات الباقة</p>{selectedPackage ? <div className="mt-1 space-y-0.5">{selectedPackage.features.map(feature => <p key={feature}>• {feature}</p>)}</div> : <p className="mt-1">لا توجد باقة محددة لهذا الطلب</p>}</div>
                    <div><p className="font-bold text-dark">تفاصيل الطلب</p><p className="mt-1">النوع: {r.request_type === 'campaign' ? 'حملة' : 'منشور واحد'}</p><p>عدد المنشورات: {r.num_posts ?? r.campaign_post_count ?? 1}</p></div>
                    <div><p className="font-bold text-dark">معلومات إضافية</p><p className="mt-1">{r.link ? 'يوجد رابط مرجعي' : 'لا يوجد رابط مرجعي'}</p><p>{Array.isArray(r.content_images) && r.content_images.length ? `${r.content_images.length} صور مرفقة` : 'لا توجد صور مرفقة'}</p></div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setExpandedRequests(current => ({ ...current, [r.id]: !expanded }))} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-dark hover:bg-cream">{expanded ? 'إخفاء التفاصيل ▲' : 'مزيد من التفاصيل ▼'}</button>
                  <button
                    onClick={(e) => openQuickAction(r, e)}
                    disabled={quickActions.length === 0}
                    className="rounded-lg bg-green px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    title={quickActions.length ? 'تنفيذ إجراء سريع' : 'لا يوجد إجراء سريع متاح لهذه الحالة'}
                  >
                    إجراءات
                  </button>
                  <button onClick={(e) => openQuickNote(r, e)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${r.admin_notes?.trim() ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>📝 {r.admin_notes?.trim() ? 'تعديل الملاحظة' : 'إضافة ملاحظة'}</button>
                  <button onClick={(e) => handleSendReminder(r, e)} disabled={sendingReminderId === r.id || !r.client_email} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50" title="إرسال تذكير بالبريد">{sendingReminderId === r.id ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /> : '✉'}</button>
                  <button onClick={(e) => handleWhatsApp(r, e)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 p-1.5 hover:bg-green/15" title="مراسلة العميل عبر واتساب"><Image src="/whatsapp-icon.avif" alt="واتساب" width={20} height={20} className="h-full w-full object-contain" /></button>
                  {r.status === 'completed' && r.client_email && !review?.rating && (
                    <button onClick={() => sendReviewInvitation(r)} disabled={sendingReviewInvitationId === r.id} className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-dark hover:bg-gold/20 disabled:opacity-50">
                      {sendingReviewInvitationId === r.id ? 'جارٍ الإرسال...' : review?.invitation_sent_at ? 'إعادة إرسال التقييم' : 'طلب تقييم'}
                    </button>
                  )}
                  {hasRefund && r.client_email && (
                    <button onClick={() => resendRefundRequestEmail(refunds[0])} disabled={resendingRefundId === refunds[0]?.id} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50" title="إرسال إشعار بأن طلب الاسترجاع قيد المعالجة">
                      {resendingRefundId === refunds[0]?.id ? 'جارٍ الإرسال...' : 'إعادة إرسال إشعار الاسترجاع'}
                    </button>
                  )}
                  {pendingManualRefund && <button onClick={() => confirmManualRefund(pendingManualRefund)} disabled={confirmingRefundId === pendingManualRefund.id} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50">{confirmingRefundId === pendingManualRefund.id ? 'جارٍ التأكيد...' : 'تأكيد تحويل الاسترجاع'}</button>}
                  {r.status === 'client_rejected' && <button onClick={(e) => { e.stopPropagation(); openRequest(r) }} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">إرسال عرض جديد</button>}
                  {r.status === 'auto_closed' && <button onClick={(e) => openRevival(r, e)} disabled={!r.client_email} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">↻ إحياء الطلب</button>}
                  <button onClick={(e) => handleDeleteClick(r, e)} disabled={deletingRequestId === r.id} className="mr-auto inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50" title="حذف الطلب نهائياً">{deletingRequestId === r.id ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /> : '🗑'}</button>
                </div>
              </article>
            )
          })}
          {!pageLoading && filteredRequestSummaries.length === 0 && <div className="p-10 text-center text-sm text-muted">لا توجد طلبات تطابق الفلاتر الحالية.</div>}
      </div>

      {totalPages > 1 && (
        <nav className="mt-5 flex flex-wrap items-center justify-center gap-3" aria-label="ترقيم صفحات الطلبات" dir="rtl">
          <button
            type="button"
            onClick={() => { setCurrentPage(page => Math.max(1, page - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            disabled={safeCurrentPage === 1 || pageLoading}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-bold text-dark transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-45"
          >
            السابق
          </button>
          <span className="rounded-lg bg-green/10 px-4 py-2 text-sm font-black text-green">الصفحة {safeCurrentPage} من {totalPages}</span>
          <button
            type="button"
            onClick={() => { setCurrentPage(page => Math.min(totalPages, page + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            disabled={safeCurrentPage === totalPages || pageLoading}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-bold text-dark transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-45"
          >
            التالي
          </button>
        </nav>
      )}

      <div className="hidden bg-card rounded-2xl border border-border overflow-hidden">
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
                // الباقة المثبتة في سجل الطلب تُحفظ مع التسعير التلقائي في auto_quote_tier.
                // نُبقي selected_package كاحتياط للطلبات التي استُوردت بصيغة أقدم.
                const selectedPackage = PACKAGES.find(pkg => pkg.id === (r.auto_quote_tier ?? r.selected_package))
                return (
                  <tr
                    key={r.id}
                    onClick={() => openRequest(r)}
                    className="border-t border-border hover:bg-cream/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{formatRequestNumber(r.request_number)}</td>

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
                        {r.admin_notes?.trim() && (
                          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-700 whitespace-pre-wrap break-words">
                            <span className="font-black">ملاحظة الإدارة: </span>{r.admin_notes.trim()}
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
                      {isDuplicate(r) && (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold">
                          👥 {requestCountByOwner[ownerKey(r)]} طلبات
                        </span>
                      )}
                      {r.is_external && (
                        <span className="inline-flex items-center gap-1 mt-1 mr-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">
                          ➕ خارجي
                        </span>
                      )}
                    </td>

                    {/* الفئة */}
                    <td className="px-3 py-3 text-sm">
                      <div>{cat?.icon} {cat?.nameAr}</div>
                      {selectedPackage && (
                        <span className="mt-1 inline-flex rounded-full border border-green/20 bg-green/10 px-2 py-0.5 text-[10px] font-bold text-green">
                          {selectedPackage.name}
                        </span>
                      )}
                    </td>

                    {/* المبلغ */}
                    <td className="px-3 py-3 text-sm">
                      {r.final_total ?? r.admin_quoted_price
                        ? formatNumber(r.final_total ?? r.admin_quoted_price ?? 0)
                        : <span className="text-muted text-xs">—</span>}
                    </td>

                    {/* الحالة */}
                    <td className="px-3 py-3"><StatusBadge status={r.status} userRole="admin" /></td>

                    {/* التاريخ */}
                    <td className="px-3 py-3 text-muted text-xs">{formatDate(r.created_at)}</td>

                    {/* إجراءات */}
                    <td className="px-3 py-3 text-center min-w-[180px]">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => openQuickNote(r, e)}
                          className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold transition-colors shrink-0 ${
                            r.admin_notes?.trim()
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                          title={r.admin_notes?.trim() ? 'تعديل ملاحظة الإدارة' : 'إضافة ملاحظة للإدارة'}
                        >
                          <span aria-hidden="true">📝</span>
                          <span>ملاحظة</span>
                        </button>

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

                        {/* زر واتساب — يظهر دائماً: رسالة خصم إن وُجد خصم، وإلا رسالة عامة */}
                        <button
                          onClick={(e) => handleWhatsApp(r, e)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          title={hasDiscount(r) ? "إرسال رسالة الخصم عبر واتساب" : "مراسلة العميل عبر واتساب"}
                        >
                          <Image src="/whatsapp-icon.avif" alt="واتساب" width={16} height={16} className="h-4 w-4 object-contain" />
                        </button>

                        {/* زر إرسال عرض جديد — يظهر فقط للطلبات التي رفضها العميل */}
                        {r.status === 'client_rejected' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openRequest(r) }}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors shrink-0"
                            title="إرسال عرض جديد للعميل"
                          >
                            <span className="text-xs">📤</span>
                          </button>
                        )}

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
            <p>لا توجد طلبات {search || statusFilter || duplicatesOnly || userFilter ? 'تطابق البحث' : 'بعد'}</p>
            {(search || statusFilter || duplicatesOnly || userFilter) && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setDuplicatesOnly(false); setUserFilter(''); setUserQuery(''); }}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                إظهار جميع الطلبات
              </button>
            )}
          </div>
        )}
      </div>

      {thumbnailTarget && (() => {
        const images: string[] = Array.isArray(thumbnailTarget.content_images)
          ? thumbnailTarget.content_images.filter((image: unknown): image is string => typeof image === 'string' && !!image.trim())
          : []
        const selectedImage = getRequestThumbnail(thumbnailTarget)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !savingThumbnail && setThumbnailTarget(null)}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/70 bg-white p-5 shadow-xl sm:p-6" onClick={event => event.stopPropagation()} dir="rtl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gold">الصورة المصغرة لبطاقة الطلب</p>
                  <h3 className="mt-1 text-lg font-black text-dark">اختر صورة من المرفقات</h3>
                  <p className="mt-1 text-sm text-muted">يظهر الاختيار للإدارة فقط، ولا يغيّر صور الطلب أو ترتيبها.</p>
                </div>
                <button type="button" onClick={() => setThumbnailTarget(null)} disabled={savingThumbnail} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-muted hover:bg-slate-100" aria-label="إغلاق">×</button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((imageUrl, index) => {
                  const isSelected = imageUrl === selectedImage
                  return (
                    <button
                      key={imageUrl}
                      type="button"
                      onClick={() => selectThumbnail(imageUrl)}
                      disabled={savingThumbnail}
                      className={`overflow-hidden rounded-xl border-2 p-2 text-right transition ${isSelected ? 'border-green bg-green/5' : 'border-border bg-white hover:border-green/60'} disabled:cursor-wait disabled:opacity-60`}
                    >
                      <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-cream/50 p-1">
                        <Image src={imageUrl} alt={`صورة مرفقة ${index + 1}`} fill unoptimized sizes="(max-width: 640px) 50vw, 220px" className="object-contain p-1" />
                      </span>
                      <span className="mt-2 block text-xs font-bold text-dark">صورة {index + 1}</span>
                      <span className={`mt-0.5 block text-[10px] font-bold ${isSelected ? 'text-green' : 'text-muted'}`}>{isSelected ? 'المحددة حالياً' : 'اختيار هذه الصورة'}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 flex justify-end">
                <button type="button" onClick={() => setThumbnailTarget(null)} disabled={savingThumbnail} className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-bold text-dark hover:bg-cream disabled:opacity-50">إلغاء</button>
              </div>
            </div>
          </div>
        )
      })()}

      {refundTarget && (() => {
        const provider = refundTarget.moyasar_payment_id ? 'ميسر' : refundTarget.tamara_order_id ? 'تمارا' : 'تحويل بنكي يدوي'
        const timing = refundTarget.moyasar_payment_id ? '3 إلى 10 أيام عمل' : refundTarget.tamara_order_id ? 'ساعات إلى عدة أيام عمل' : 'يومين إلى 5 أيام عمل'
        const isManual = !refundTarget.moyasar_payment_id && !refundTarget.tamara_order_id
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !processingRefund && setRefundTarget(null)}>
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/70 bg-white p-5 shadow-xl sm:p-6" onClick={event => event.stopPropagation()} dir="rtl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-red-600">استرجاع مبلغ للعميل</p>
                  <h3 className="mt-1 text-lg font-black text-dark">{formatRequestNumber(refundTarget.request_number)}</h3>
                  <p className="mt-1 text-sm text-muted">وسيلة الدفع: {provider}</p>
                </div>
                <button type="button" onClick={() => setRefundTarget(null)} disabled={processingRefund} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-muted hover:bg-slate-100" aria-label="إغلاق">×</button>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-cream/40 px-4 py-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted">المتاح للاسترجاع</span><strong className="text-dark">{formatNumber(refundTarget.remainingRefundAmount ?? 0)} ر.س</strong></div>
                <div className="mt-2 border-t border-border pt-2 text-xs leading-5 text-muted">سيظهر للعميل أن انعكاس المبلغ متوقع خلال <strong className="text-dark">{timing}</strong>.</div>
              </div>

              {isManual && <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">لا يمكن تنفيذ التحويل البنكي آلياً. سيُسجّل الطلب كاسترجاع قيد المعالجة حتى تنفّذ التحويل خارج المنصة.</div>}
              {!isManual && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">سيتم تنفيذ الاسترجاع فور تأكيدك عبر {provider}. لا يمكن التراجع عن العملية من المنصة.</div>}

              <label className="mt-4 block text-sm font-bold text-dark">مبلغ الاسترجاع
                <div className="relative mt-2"><input type="number" min="0.01" max={refundTarget.remainingRefundAmount ?? 0} step="0.01" value={refundAmount} onChange={event => setRefundAmount(event.target.value)} className="min-h-[46px] w-full rounded-lg border border-border bg-white px-3 pl-12 text-sm outline-none focus:border-red-400" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">ر.س</span></div>
              </label>
              <label className="mt-4 block text-sm font-bold text-dark">سبب الاسترجاع
                <textarea value={refundReason} onChange={event => setRefundReason(event.target.value)} maxLength={1000} rows={4} className="mt-2 w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal text-dark outline-none focus:border-red-400" placeholder="يُحفظ في سجل الإدارة ولا يظهر للعميل." />
              </label>
              <div className="mt-5 flex gap-3">
                <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={processingRefund} className="flex-1">إلغاء</Button>
                <Button onClick={submitRefund} loading={processingRefund} className="flex-1 bg-red-600 hover:bg-red-700">{isManual ? 'تسجيل طلب الاسترجاع' : 'تأكيد الاسترجاع'}</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {quickActionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !savingQuickAction && setQuickActionTarget(null)}>
          <div className="w-full max-w-md rounded-lg border border-white/70 bg-white p-5 shadow-xl sm:p-6" onClick={event => event.stopPropagation()} dir="rtl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gold">إجراء سريع للطلب {formatRequestNumber(quickActionTarget.request_number)}</p>
                <h3 className="mt-1 text-lg font-black text-dark">تحديث حالة الطلب</h3>
                <p className="mt-1 text-sm text-muted">{quickActionTarget.client_name || 'العميل'} · {quickActionTarget.title || 'طلب بدون عنوان'}</p>
              </div>
              <button type="button" onClick={() => setQuickActionTarget(null)} disabled={savingQuickAction} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-muted hover:bg-slate-100" aria-label="إغلاق">×</button>
            </div>

            {quickActionsFor(quickActionTarget).length > 0 ? (
              <>
                <label className="mt-5 block text-sm font-bold text-dark">
                  الإجراء
                  <select value={quickActionStatus} onChange={event => setQuickActionStatus(event.target.value)} className="mt-2 min-h-[46px] w-full rounded-lg border border-border bg-white px-3 text-sm text-dark outline-none focus:border-green">
                    {quickActionsFor(quickActionTarget).map(status => (
                      <option key={status} value={status}>{quickActionLabel(quickActionTarget.status, status, quickActionTarget.billing_source)}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-bold text-dark">
                  ملاحظة للإدارة (اختيارية)
                  <textarea value={quickActionNotes} onChange={event => setQuickActionNotes(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal text-dark outline-none focus:border-green" placeholder="تظهر في بطاقة الطلب ويمكن تضمينها في إشعار الحالة." />
                </label>
                <p className="mt-3 text-xs leading-5 text-muted">
                  {quickActionStatus === REFUND_QUICK_ACTION
                    ? 'ستفتح نافذة الاسترجاع لمراجعة المبلغ والسبب ومزود الدفع قبل التنفيذ.'
                    : quickActionStatus === 'suspended' || quickActionStatus === 'resume'
                    ? 'إجراء داخلي فقط: لن يصل إلى العميل أي إشعار.'
                    : quickActionTarget.billing_source === 'membership' && quickActionTarget.status === 'pending'
                      ? quickActionStatus === 'in_progress'
                        ? 'سيُستهلك الرصيد والمزايا المحجوزة ويبدأ تنفيذ الطلب.'
                        : 'سيُرفض الطلب ويُعاد الرصيد والمزايا المحجوزة تلقائياً.'
                      : 'سيُطبّق الإجراء وفق مسار الحالة المعتمد، ويصل إشعار للعميل عند الحاجة.'}
                </p>
                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={() => setQuickActionTarget(null)} disabled={savingQuickAction} className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-bold text-dark hover:bg-cream disabled:opacity-50">إلغاء</button>
                  <button type="button" onClick={handleQuickAction} disabled={!quickActionStatus || savingQuickAction} className="flex-1 rounded-lg bg-green px-4 py-2.5 text-sm font-black text-white hover:bg-green/90 disabled:opacity-50">{savingQuickAction ? 'جارٍ التنفيذ...' : 'تأكيد الإجراء'}</button>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-muted">لا يوجد إجراء سريع متاح لهذه الحالة. يمكنك فتح الطلب لمتابعة خطواته التفصيلية.</div>
            )}
          </div>
        </div>
      )}

      {revivalTarget && (() => {
        const originalPrice = Number(revivalTarget.final_total ?? revivalTarget.admin_quoted_price ?? 0)
        const revivedPrice = Math.round(originalPrice * (1 - revivalDiscountPct / 100) * 100) / 100
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !sendingRevival && setRevivalTarget(null)}>
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6" onClick={event => event.stopPropagation()} dir="rtl">
              <div className="mb-5">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">طلب أُغلق تلقائياً</span>
                <h3 className="mt-3 text-xl font-black text-dark">إحياء الطلب وإرسال عرض عودة</h3>
                <p className="mt-1 text-sm text-muted">{formatRequestNumber(revivalTarget.request_number)} · {revivalTarget.client_name || 'العميل'}</p>
              </div>

              <div className="grid gap-3 rounded-xl border border-border bg-cream/35 p-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-dark">نسبة الخصم
                  <div className="relative mt-2"><input type="number" min="0" max="99" value={revivalDiscountPct} onChange={event => setRevivalDiscountPct(Number(event.target.value))} className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 pl-8 text-sm outline-none focus:border-green" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span></div>
                </label>
                <label className="block text-sm font-bold text-dark">صلاحية العرض
                  <div className="relative mt-2"><input type="number" min="1" max="30" value={revivalValidDays} onChange={event => setRevivalValidDays(Number(event.target.value))} className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 pl-12 text-sm outline-none focus:border-green" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">أيام</span></div>
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-green/20 bg-green/5 px-4 py-3 text-sm">
                <span className="font-bold text-dark">السعر بعد العرض</span>
                <span className="font-black text-green">{formatNumber(revivedPrice)} ر.س <span className="mr-1 text-xs font-normal text-muted line-through">{formatNumber(originalPrice)}</span></span>
              </div>

              <label className="mt-4 block text-sm font-bold text-dark">رسالة للعميل
                <textarea value={revivalMessage} onChange={event => setRevivalMessage(event.target.value)} maxLength={600} className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-border px-3 py-2 text-sm font-normal leading-6 outline-none focus:border-green" placeholder="اكتب رسالة عرض العودة..." />
              </label>
              <p className="mt-2 text-xs leading-5 text-muted">سيصل العميل بريد يتضمن السعر الجديد ورابط استكمال الطلب. بعد الإرسال يصبح الطلب بانتظار موافقة العميل.</p>

              <div className="mt-5 flex gap-3">
                <Button variant="outline" onClick={() => setRevivalTarget(null)} disabled={sendingRevival} className="flex-1">إلغاء</Button>
                <Button onClick={handleReviveRequest} loading={sendingRevival} className="flex-[1.5] bg-slate-700 hover:bg-slate-800">إرسال عرض العودة</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Quick Admin Note Dialog */}
      {quickNoteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !savingQuickNote && setQuickNoteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-lg font-black text-red-700">ملاحظة الإدارة</h3>
              <p className="mt-1 text-sm text-muted">
                {formatRequestNumber(quickNoteTarget.request_number)} · تظهر للعميل باللون الأحمر في بطاقة الطلب.
              </p>
            </div>
            <textarea
              value={quickNote}
              onChange={event => setQuickNote(event.target.value)}
              className="min-h-[130px] w-full resize-y rounded-xl border border-red-200 bg-red-50/40 px-3 py-2 text-sm text-dark outline-none focus:border-red-400"
              placeholder="اكتب الملاحظة التي تريد أن يراها العميل..."
              maxLength={1000}
              autoFocus
            />
            <div className="mt-1 text-left text-xs text-muted">{quickNote.length}/1000</div>
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setQuickNoteTarget(null); setQuickNote('') }}
                className="flex-1"
                disabled={savingQuickNote}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSaveQuickNote}
                loading={savingQuickNote}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                حفظ الملاحظة
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Single Reminder Dialog */}
      {reminderTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="text-5xl mb-2">📧</div>
              <h3 className="text-lg font-bold text-blue-700 mb-1">إرسال تذكير للعميل</h3>
              <p className="text-sm text-gray-600">
                الطلب: <strong>{formatRequestNumber(reminderTarget.request_number)}</strong>
              </p>
              <p className="text-xs text-muted mt-1">
                {reminderTarget.client_name || '—'} · {reminderTarget.client_email}
              </p>
              {(reminderTarget.final_total ?? reminderTarget.admin_quoted_price) && (
                <p className="text-xs text-muted mt-1">
                  السعر الحالي: <strong className="text-gold">{formatNumber(reminderTarget.final_total ?? reminderTarget.admin_quoted_price ?? 0)} ر.س</strong>
                </p>
              )}
            </div>

            {reminderTarget.status === 'quoted' ? (
              <>
                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all mb-3 ${
                  singleApplyDiscount ? 'bg-orange-50 border-orange-400' : 'bg-white border-border hover:border-orange-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={singleApplyDiscount}
                    onChange={e => setSingleApplyDiscount(e.target.checked)}
                    className="mt-1 w-5 h-5 accent-orange-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-dark text-sm">🎯 تقديم خصم خاص للعميل</div>
                    <div className="text-xs text-muted mt-0.5">
                      يُحدَّث سعر العرض في الطلب ويصل العميل بريد بالسعر الجديد
                    </div>
                  </div>
                </label>

                {singleApplyDiscount && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
                    <label className="block text-xs font-medium text-orange-800 mb-2">
                      نسبة الخصم (%)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={singleDiscountPct}
                      onChange={e => setSingleDiscountPct(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border border-orange-300 bg-white text-sm"
                    />
                    {(reminderTarget.admin_quoted_price ?? reminderTarget.final_total ?? 0) > 0 && singleDiscountPct > 0 && singleDiscountPct < 100 && (
                      <p className="text-xs text-orange-700 mt-2 leading-relaxed">
                        السعر بعد الخصم:{' '}
                        <strong>
                          {formatNumber(
                            Math.round(
                              (reminderTarget.admin_quoted_price ?? reminderTarget.final_total ?? 0) *
                                (1 - singleDiscountPct / 100) * 100
                            ) / 100
                          )}{' '}
                          ر.س
                        </strong>
                        {' '}(توفير{' '}
                        {formatNumber(
                          Math.round(
                            (reminderTarget.admin_quoted_price ?? reminderTarget.final_total ?? 0) *
                              (singleDiscountPct / 100) * 100
                          ) / 100
                        )}
                        {' '}ر.س)
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted text-center bg-blue-50 border border-blue-200 rounded-xl py-2 px-3 mb-4">
                💡 خيار الخصم متاح فقط للطلبات بحالة «بانتظار موافقة العميل»
              </p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setReminderTarget(null)}
                className="flex-1"
                disabled={sendingReminderId === reminderTarget.id}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleConfirmSingleReminder}
                loading={sendingReminderId === reminderTarget.id}
                className={singleApplyDiscount && reminderTarget.status === 'quoted'
                  ? 'flex-1 bg-orange-600 hover:bg-orange-700'
                  : 'flex-1'}
              >
                {singleApplyDiscount && reminderTarget.status === 'quoted'
                  ? `إرسال + خصم ${singleDiscountPct}%`
                  : 'إرسال الآن'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reminder Confirmation Dialog */}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="text-6xl mb-3">🔔</div>
              <h3 className="text-xl font-bold text-orange-700 mb-2">تأكيد الإرسال الجماعي</h3>
              <p className="text-sm text-gray-600">
                سيتم إرسال تذكير لـ <strong>{quotedCount}</strong> عميل لديهم عروض بانتظار موافقتهم.
              </p>
            </div>

            <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all mb-3 ${
              bulkApplyDiscount ? 'bg-orange-50 border-orange-400' : 'bg-white border-border hover:border-orange-300'
            }`}>
              <input
                type="checkbox"
                checked={bulkApplyDiscount}
                onChange={e => setBulkApplyDiscount(e.target.checked)}
                className="mt-1 w-5 h-5 accent-orange-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="font-bold text-dark text-sm">🎯 تطبيق خصم وتحديث الأسعار</div>
                <div className="text-xs text-muted mt-0.5">
                  يُحدَّث سعر كل عرض ويُرسَل البريد بالسعر الجديد
                </div>
              </div>
            </label>

            {bulkApplyDiscount && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
                <label className="block text-xs font-medium text-orange-800 mb-2">
                  نسبة الخصم (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={bulkDiscountPct}
                  onChange={e => setBulkDiscountPct(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-orange-300 bg-white text-sm"
                />
                <p className="text-xs text-orange-700 mt-2 leading-relaxed">
                  ⚠️ سيُعدَّل <strong>admin_quoted_price</strong> و <strong>final_total</strong> لكل عرض،
                  ويصل العميل بريد بالسعر الجديد بدلاً من بريد التذكير العادي.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowBulkConfirm(false); setBulkApplyDiscount(false) }}
                className="flex-1"
                disabled={sendingBulkReminder}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleBulkReminder}
                loading={sendingBulkReminder}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                {bulkApplyDiscount ? `إرسال + خصم ${bulkDiscountPct}%` : 'إرسال الآن'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBulkReviewConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !sendingBulkReviewInvitations && setShowBulkReviewConfirm(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()} dir="rtl">
            <div className="text-center">
              <div className="text-5xl text-gold">★★★★★</div>
              <h3 className="mt-3 text-xl font-black text-dark">إرسال طلبات التقييم</h3>
              <p className="mt-2 text-sm leading-6 text-muted">سيُرسل رابط تقييم إلى <strong className="text-dark">{requestSummaries.filter(request => request.status === 'completed' && request.client_email && !reviewsByRequest[request.id]?.rating).length}</strong> عميل من الطلبات المكتملة.</p>
            </div>
            <div className="mt-4 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs leading-5 text-dark">لن تُرسل الدعوة للعملاء الذين قيّموا طلباتهم مسبقاً. والرابط صالح لمدة 30 يوماً ولا يتطلب تسجيل دخول.</div>
            <div className="mt-5 flex gap-3">
              <Button variant="outline" onClick={() => setShowBulkReviewConfirm(false)} disabled={sendingBulkReviewInvitations} className="flex-1">إلغاء</Button>
              <Button onClick={handleBulkReviewInvitations} loading={sendingBulkReviewInvitations} className="flex-1 bg-gold text-dark hover:bg-gold/90">إرسال التقييمات</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && requestToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-700 mb-2">تأكيد حذف الطلب</h3>
              <p className="text-sm text-gray-600">
                هل أنت متأكد من حذف طلب <strong>{formatRequestNumber(requestToDelete.request_number)}</strong>؟
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

      {/* External Request Dialog — تسجيل طلب نُشر ودُفع خارج المنصة */}
      {showExternalForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">➕</div>
              <h3 className="text-lg font-bold text-green-700 mb-1">تسجيل طلب خارجي</h3>
              <p className="text-xs text-gray-600">
                طلب من خارج المنصة — يُحتسب ضمن إحصاءات الموقع وإيراداته
              </p>
            </div>

            <div className="space-y-3">
              {/* وضع الطلب */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">نوع التسجيل *</label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setExtMode('completed')}
                    className={`text-right rounded-xl border-2 p-3 transition-all ${extMode === 'completed' ? 'border-green bg-green/5 ring-2 ring-green/30' : 'border-border bg-white hover:border-green/40'}`}
                  >
                    <div className="font-bold text-sm text-dark">✅ مكتمل (نُشر ودُفع مسبقاً)</div>
                    <div className="text-xs text-muted">تسجيل للإحصاءات فقط — يُحفظ كطلب مكتمل.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtMode('in_progress')}
                    className={`text-right rounded-xl border-2 p-3 transition-all ${extMode === 'in_progress' ? 'border-green bg-green/5 ring-2 ring-green/30' : 'border-border bg-white hover:border-green/40'}`}
                  >
                    <div className="font-bold text-sm text-dark">⚡ قيد التنفيذ (سأجهّز المحتوى)</div>
                    <div className="text-xs text-muted">أدخل تفاصيل الخبر، ويُفتح الطلب لتصميمه عبر استوديو الذكاء الاصطناعي، ثم غيّر الحالة لمكتمل لاحقاً.</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">اسم العميل *</label>
                <Input value={extName} onChange={e => setExtName(e.target.value)} placeholder="اسم العميل" />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">الفئة (نوع الخبر) *</label>
                <select
                  value={extCategory}
                  onChange={e => setExtCategory(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm min-h-[44px]"
                >
                  <option value="">— اختر الفئة —</option>
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.nameAr}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">المبلغ المدفوع (ر.س) *</label>
                <Input type="number" value={extAmount} onChange={e => setExtAmount(e.target.value)} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  عنوان الخبر {extMode === 'in_progress' ? '*' : '(اختياري)'}
                </label>
                <Input value={extTitle} onChange={e => setExtTitle(e.target.value)} placeholder="عنوان الخبر" />
              </div>

              {extMode === 'in_progress' && (
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">تفاصيل/نص الخبر *</label>
                  <textarea
                    value={extContent}
                    onChange={e => setExtContent(e.target.value)}
                    placeholder="اكتب تفاصيل الخبر التي سيُصاغ منها المحتوى والتصاميم عبر الاستوديو..."
                    className="w-full px-4 py-2 rounded-xl border border-border bg-white text-sm min-h-[120px] resize-y"
                  />
                  <p className="text-xs text-muted mt-1">يمكنك لاحقاً رفع صورة المصدر من داخل الاستوديو.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-dark mb-1">تاريخ النشر/الدفع (اختياري)</label>
                <Input type="date" value={extDate} onChange={e => setExtDate(e.target.value)} />
                <p className="text-xs text-muted mt-1">يُترك فارغاً = تاريخ اليوم</p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button
                variant="outline"
                onClick={() => { setShowExternalForm(false); resetExternalForm() }}
                className="flex-1"
                disabled={savingExternal}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSaveExternal}
                loading={savingExternal}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                حفظ الطلب
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function AdminDirectRequestsPage() {
  return <AdminRequestsPage scope="direct" />
}
