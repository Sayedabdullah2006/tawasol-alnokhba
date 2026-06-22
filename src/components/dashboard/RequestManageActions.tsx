'use client'

// أزرار «تعديل الطلب» و«إلغاء الطلب» للطلبات غير المدفوعة — تمنع النهاية المسدودة.
// تُستخدم في صفحة تفاصيل الطلب وفي شاشة المنع داخل نموذج الطلب.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { DRAFT_KEY, requestToDraft } from '@/lib/request-draft'

// نفس حالات الإلغاء في الخادم (قبل أي دفع مؤكَّد)
const CANCELLABLE = ['pending', 'quoted', 'negotiation', 'approved', 'info_requested']

export default function RequestManageActions({
  request,
  onCancelled,
  className = '',
}: {
  request: Record<string, any>
  onCancelled?: () => void
  className?: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState<'edit' | 'cancel' | null>(null)
  const [confirming, setConfirming] = useState(false)

  // لا نعرض الإلغاء/التعديل إذا كان الطلب مدفوعاً (تمارا/ميسر/تحويل) أو حالته غير قابلة للإلغاء.
  // فحص الدفع يمنع سباق تأكيد الدفع حيث قد تبقى الحالة "approved" لحظات بعد الدفع.
  const isPaid =
    request?.payment_status === 'paid' ||
    !!request?.paid_at ||
    !!request?.tamara_order_id ||
    !!request?.moyasar_payment_id
  if (!request || isPaid || !CANCELLABLE.includes(request.status) || request.receipt_url) return null

  const callCancel = async () => {
    const res = await fetch('/api/request/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'تعذّر إلغاء الطلب')
    }
  }

  // التعديل = حفظ بيانات الطلب كمسودة + إلغاء القديم + فتح النموذج لإعادة الإرسال
  const handleEdit = async () => {
    setBusy('edit')
    try {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(requestToDraft(request))) } catch { /* تجاهل */ }
      await callCancel()
      showToast('عدّل بياناتك ثم أعد الإرسال ✏️')
      // تحميل كامل لـ/request لضمان إعادة بناء النموذج واسترجاع المسودة (يعمل من لوحة
      // التحكم ومن داخل النموذج نفسه على حدّ سواء)
      window.location.assign('/request')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'حدث خطأ', 'error')
      setBusy(null)
    }
  }

  const handleCancel = async () => {
    setBusy('cancel')
    try {
      await callCancel()
      showToast('تم إلغاء الطلب — يمكنك تقديم طلب جديد')
      if (onCancelled) onCancelled()
      else { router.push('/dashboard'); router.refresh() }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'حدث خطأ', 'error')
      setBusy(null)
    }
  }

  return (
    <div className={`bg-card rounded-2xl border border-border p-4 ${className}`}>
      <h3 className="font-bold text-dark text-sm mb-1">إدارة الطلب</h3>
      <p className="text-xs text-muted mb-3">
        تريد تصحيح بياناتك أو البدء من جديد؟ يمكنك تعديل هذا الطلب أو إلغاؤه قبل الدفع.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={handleEdit}
          disabled={!!busy}
          className="flex-1 rounded-xl border-2 border-green text-green font-bold text-sm py-2.5 hover:bg-green/5 transition-colors disabled:opacity-50"
        >
          {busy === 'edit' ? 'جارٍ الفتح…' : '✏️ تعديل الطلب'}
        </button>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!!busy}
            className="flex-1 rounded-xl border-2 border-red-200 text-red-600 font-bold text-sm py-2.5 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            🗑️ إلغاء الطلب
          </button>
        ) : (
          <div className="flex-1 flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!!busy}
              className="flex-1 rounded-xl bg-red-600 text-white font-bold text-sm py-2.5 hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {busy === 'cancel' ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={!!busy}
              className="rounded-xl border border-border text-muted text-sm px-4 hover:bg-cream transition-colors disabled:opacity-50"
            >
              تراجع
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
