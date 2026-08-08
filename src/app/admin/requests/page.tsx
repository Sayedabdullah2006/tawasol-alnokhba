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
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  // فلتر المستخدم: مفتاح المستخدم المختار + نص البحث في القائمة + إظهار القائمة
  const [userFilter, setUserFilter] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [showUserList, setShowUserList] = useState(false)
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [requestToDelete, setRequestToDelete] = useState<any>(null)
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [sendingBulkReminder, setSendingBulkReminder] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkApplyDiscount, setBulkApplyDiscount] = useState(false)
  const [bulkDiscountPct, setBulkDiscountPct] = useState<number>(10)
  const [reminderTarget, setReminderTarget] = useState<any | null>(null)
  const [singleApplyDiscount, setSingleApplyDiscount] = useState(false)
  const [singleDiscountPct, setSingleDiscountPct] = useState<number>(10)
  const [quickNoteTarget, setQuickNoteTarget] = useState<any | null>(null)
  const [quickNote, setQuickNote] = useState('')
  const [savingQuickNote, setSavingQuickNote] = useState(false)
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

  // مفتاح هوية صاحب الطلب — user_id أولاً، وإلا البريد، وإلا الجوال.
  // نتجاهل القيم النائبة ('-' أو الفارغة) — مثل الطلبات الخارجية — ونعطيها
  // مفتاحاً فريداً لكل طلب حتى لا تُجمَّع طلبات أشخاص مختلفين معاً.
  const cleanId = (v: any): string => {
    const s = String(v ?? '').trim().toLowerCase()
    return s && s !== '-' ? s : ''
  }
  const ownerKey = (r: any): string =>
    r.user_id || cleanId(r.client_email) || cleanId(r.client_phone) || `req:${r.id}`

  // عدد طلبات كل مستخدم (لتحديد المكررين وعرض الشارة)
  const requestCountByOwner = requests.reduce((acc: Record<string, number>, r) => {
    const key = ownerKey(r)
    if (key) acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const isDuplicate = (r: any): boolean => {
    const key = ownerKey(r)
    return !!key && (requestCountByOwner[key] ?? 0) > 1
  }

  // قائمة المستخدمين الفريدة الذين لديهم طلبات (للفلتر بالاسم)
  const usersList = (() => {
    const map = new Map<string, { key: string; name: string; email: string; count: number }>()
    for (const r of requests) {
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

  const filteredRequests = requests
    .filter(r => {
      if (userFilter && ownerKey(r) !== userFilter) return false
      if (duplicatesOnly && !isDuplicate(r)) return false
      if (statusFilter && r.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          r.client_name?.toLowerCase().includes(q) ||
          r.client_email?.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q) ||
          r.content?.toLowerCase().includes(q) ||
          r.admin_notes?.toLowerCase().includes(q) ||
          generateRequestNumber(r.request_number).toLowerCase().includes(q)
        )
      }
      return true
    })
    // عند تفعيل فلتر المكرر: تجميع طلبات كل مستخدم معاً (مع الحفاظ على ترتيب التاريخ داخل كل مجموعة)
    .sort((a, b) => (duplicatesOnly ? ownerKey(a).localeCompare(ownerKey(b)) : 0))

  // عدد المستخدمين الذين لديهم أكثر من طلب (لعرضه على زر الفلتر)
  const duplicateOwnersCount = Object.values(requestCountByOwner).filter(c => c > 1).length

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

  const openQuickNote = (request: any, event: React.MouseEvent) => {
    event.stopPropagation()
    setQuickNoteTarget(request)
    setQuickNote(request.admin_notes ?? '')
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
      showToast(quickNote.trim() ? 'تم حفظ الملاحظة وتظهر الآن في بطاقة الطلب' : 'تم حذف ملاحظة الإدارة')
      setQuickNoteTarget(null)
      setQuickNote('')
    } catch {
      showToast('خطأ في الاتصال بالخادم', 'error')
    } finally {
      setSavingQuickNote(false)
    }
  }

  const quotedCount = requests.filter(r => r.status === 'quoted').length

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

  const handleSendReminder = (request: any, event: React.MouseEvent) => {
    event.stopPropagation() // منع فتح صفحة الطلب
    setSingleApplyDiscount(false)
    setSingleDiscountPct(10)
    setReminderTarget(request)
  }

  // هل طُبِّق خصم على هذا الطلب؟ (تُحدِّد نوع رسالة الواتساب)
  const hasDiscount = (request: any) => Boolean(request.offer_discount_sent_at)

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
  const buildDiscountWhatsAppMessage = (request: any) => {
    const clientName = request.client_name || 'عزيزنا'
    const requestNumber = generateRequestNumber(request.request_number)
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
  const buildGeneralWhatsAppMessage = (request: any) => {
    const clientName = request.client_name || 'عزيزنا'
    const requestNumber = generateRequestNumber(request.request_number)

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

  const handleWhatsApp = (request: any, event: React.MouseEvent) => {
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
        const requestNum = generateRequestNumber(request.request_number)
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

        {/* فلتر باسم المستخدم — قائمة قابلة للبحث بكل المستخدمين الذين لديهم طلبات */}
        <div className="relative">
          <input
            type="text"
            value={userFilter ? selectedUserName : userQuery}
            onChange={e => { setUserFilter(''); setUserQuery(e.target.value); setShowUserList(true) }}
            onFocus={() => setShowUserList(true)}
            onBlur={() => setTimeout(() => setShowUserList(false), 150)}
            placeholder={`👤 فلترة بالمستخدم (${usersList.length})`}
            className="px-4 py-2 rounded-xl border border-border bg-card text-sm min-h-[48px] w-56"
          />
          {userFilter && (
            <button
              onClick={() => { setUserFilter(''); setUserQuery('') }}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-red-600 text-sm"
              title="مسح الفلتر"
            >
              ✕
            </button>
          )}
          {showUserList && (
            <div className="absolute z-30 mt-1 w-72 max-h-72 overflow-y-auto bg-white border border-border rounded-xl shadow-lg right-0">
              {filteredUsersList.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted text-center">لا يوجد مستخدمون مطابقون</div>
              ) : (
                filteredUsersList.map(u => (
                  <button
                    key={u.key}
                    onMouseDown={() => { setUserFilter(u.key); setUserQuery(''); setShowUserList(false) }}
                    className="w-full text-right px-4 py-2.5 hover:bg-cream/60 transition-colors border-b border-border/50 last:border-0 flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-dark font-medium truncate">{u.name}</span>
                    <span className="text-[10px] text-muted bg-cream px-1.5 py-0.5 rounded-md shrink-0">{u.count} طلب</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <Button variant="outline" onClick={handleExport}>تصدير CSV</Button>

        <Button
          variant="outline"
          onClick={() => router.push('/admin/studio')}
          className="border-green text-green hover:bg-green/5"
        >
          🤖 استوديو الذكاء الاصطناعي
        </Button>

        <Button
          onClick={() => setShowExternalForm(true)}
          className="bg-green-600 hover:bg-green-700"
        >
          ➕ تسجيل طلب خارجي
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowBulkConfirm(true)}
          disabled={quotedCount === 0}
          className="border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
        >
          🔔 تذكير جماعي للعروض ({quotedCount})
        </Button>

        <Button
          variant="outline"
          onClick={() => setDuplicatesOnly(v => !v)}
          disabled={!duplicatesOnly && duplicateOwnersCount === 0}
          className={duplicatesOnly
            ? 'border-purple-400 bg-purple-50 text-purple-700'
            : 'border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50'}
        >
          👥 {duplicatesOnly ? 'إلغاء فلتر المكرر' : `الطلبات المكررة (${duplicateOwnersCount})`}
        </Button>

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
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.728-.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                          </svg>
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

      {/* Quick Admin Note Dialog */}
      {quickNoteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !savingQuickNote && setQuickNoteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-lg font-black text-red-700">ملاحظة الإدارة</h3>
              <p className="mt-1 text-sm text-muted">
                {generateRequestNumber(quickNoteTarget.request_number)} · تظهر للعميل باللون الأحمر في بطاقة الطلب.
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
                الطلب: <strong>{generateRequestNumber(reminderTarget.request_number)}</strong>
              </p>
              <p className="text-xs text-muted mt-1">
                {reminderTarget.client_name || '—'} · {reminderTarget.client_email}
              </p>
              {(reminderTarget.final_total ?? reminderTarget.admin_quoted_price) && (
                <p className="text-xs text-muted mt-1">
                  السعر الحالي: <strong className="text-gold">{formatNumber(reminderTarget.final_total ?? reminderTarget.admin_quoted_price)} ر.س</strong>
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
                    {(reminderTarget.admin_quoted_price ?? reminderTarget.final_total) > 0 && singleDiscountPct > 0 && singleDiscountPct < 100 && (
                      <p className="text-xs text-orange-700 mt-2 leading-relaxed">
                        السعر بعد الخصم:{' '}
                        <strong>
                          {formatNumber(
                            Math.round(
                              (reminderTarget.admin_quoted_price ?? reminderTarget.final_total) *
                                (1 - singleDiscountPct / 100) * 100
                            ) / 100
                          )}{' '}
                          ر.س
                        </strong>
                        {' '}(توفير{' '}
                        {formatNumber(
                          Math.round(
                            (reminderTarget.admin_quoted_price ?? reminderTarget.final_total) *
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
                💡 خيار الخصم متاح فقط للطلبات بحالة "بانتظار موافقة العميل"
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
