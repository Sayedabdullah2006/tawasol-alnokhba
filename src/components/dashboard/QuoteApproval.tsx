'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { calculateReach } from '@/lib/pricing-engine'
import { useToast } from '@/components/ui/Toast'
import { formatNumber, formatNumberShort } from '@/lib/utils'
import Button from '@/components/ui/Button'

interface OfferedExtra {
  id: string
  name: string
  price: number
  reachBoost: number
}

interface Influencer {
  x_followers?: number | null
  ig_followers?: number | null
  li_followers?: number | null
  tk_followers?: number | null
}

interface Props {
  requestId: string
  quotedPrice: number
  offeredExtras: OfferedExtra[]
  influencer: Influencer | null
  scope: 'single' | 'all'
  adminNotes?: string | null
}

export default function QuoteApproval({
  requestId, quotedPrice, offeredExtras, influencer, scope, adminNotes
}: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [negotiating, setNegotiating] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [negotiationReason, setNegotiationReason] = useState('')
  const [proposedPrice, setProposedPrice] = useState('')

  const extrasMap = useMemo(() => new Map(offeredExtras.map(e => [e.id, e])), [offeredExtras])

  const extrasTotal = selected.reduce((sum, id) => sum + (extrasMap.get(id)?.price ?? 0), 0)
  const finalTotal = quotedPrice + extrasTotal

  const reach = useMemo(() => {
    if (!influencer) return 0
    return calculateReach({ influencer, scope, extras: selected })
  }, [influencer, scope, selected])

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleApprove = async () => {
    setSubmitting(true)
    const res = await fetch('/api/approve-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, selectedExtras: selected }),
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok && data.redirectTo) {
      router.push(data.redirectTo)
    } else {
      showToast(data.error ?? 'فشل اعتماد العرض', 'error')
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      showToast('يرجى كتابة سبب رفض العرض', 'error')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/reject-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        rejectionReason: rejectionReason.trim()
      }),
    })

    if (res.ok) {
      showToast('تم رفض العرض')
      router.push('/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل رفض العرض', 'error')
      setSubmitting(false)
    }
  }

  const handleNegotiate = async () => {
    if (!negotiationReason.trim() || !proposedPrice.trim()) {
      showToast('يرجى كتابة سبب التفاوض والسعر المقترح', 'error')
      return
    }

    const proposedAmount = parseFloat(proposedPrice)
    if (isNaN(proposedAmount) || proposedAmount < 0) {
      showToast('يرجى إدخال سعر صالح', 'error')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/request-negotiation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        negotiationReason: negotiationReason.trim(),
        proposedPrice: proposedAmount
      }),
    })

    if (res.ok) {
      showToast('تم إرسال طلب التفاوض')
      router.push('/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل إرسال طلب التفاوض', 'error')
      setSubmitting(false)
    }
  }

  const isFreeBase = quotedPrice <= 0
  const isFreeFinal = finalTotal <= 0

  return (
    <div className="space-y-4">
      {isFreeBase ? (
        <div className="bg-gradient-to-l from-green/15 to-gold/15 border-2 border-gold/40 rounded-2xl p-5 text-center">
          <div className="text-4xl mb-2">🎁</div>
          <p className="font-black text-dark text-lg mb-1">منشور مجاني من تواصل النخبة</p>
          <p className="text-xs text-muted">قدّمت لك الإدارة هذه الخدمة بدون مقابل</p>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="font-bold text-blue-700 text-sm mb-1">💰 وصلك العرض</p>
          <p className="text-xs text-blue-600">راجع السعر واختر الخدمات الإضافية التي تريدها — السعر يتحدث تلقائياً.</p>
        </div>
      )}

      {adminNotes && (
        <div className="bg-cream rounded-xl p-3 text-sm">
          <span className="text-muted block text-xs mb-1">ملاحظة من الإدارة</span>
          <p className="text-dark">{adminNotes}</p>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-muted text-sm">السعر الرئيسي</span>
          {isFreeBase ? (
            <span className="font-black text-green">مجاني 🎁</span>
          ) : (
            <span className="font-bold text-dark">{formatNumber(quotedPrice)} ر.س</span>
          )}
        </div>
        {extrasTotal > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted">الخدمات الإضافية ({selected.length})</span>
            <span className="text-green">+{formatNumber(extrasTotal)} ر.س</span>
          </div>
        )}
        <div className="border-t border-border pt-3 mt-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-dark">الإجمالي</span>
            {isFreeFinal ? (
              <span className="font-black text-2xl text-green">مجاني</span>
            ) : (
              <span className="font-black text-2xl text-gold">{formatNumber(finalTotal)} ر.س</span>
            )}
          </div>
          <div className="flex justify-between items-center text-sm mt-2">
            <span className="text-muted">الوصول المتوقع</span>
            <span className="font-bold text-green">{formatNumberShort(reach)} متابع</span>
          </div>
        </div>
      </div>

      {!isFreeBase && offeredExtras.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-bold text-dark mb-1">هل تحتاج خدمات إضافية؟</h3>
          <p className="text-xs text-muted mb-4">كل خدمة تزيد السعر والوصول المتوقع</p>

          <div className="space-y-2">
            {offeredExtras.map(e => {
              const isSelected = selected.includes(e.id)
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggle(e.id)}
                  className={`w-full text-right flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-green/5 border-green shadow-sm'
                      : 'bg-white border-border hover:border-green/40'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-green border-green' : 'border-border'
                  }`}>
                    {isSelected && <span className="text-white text-xs">✓</span>}
                  </div>
                  <span className="flex-1 font-medium text-sm text-dark">{e.name}</span>
                  <div className="text-xs space-y-0.5 text-left">
                    <div className="text-gold font-bold">+{formatNumber(e.price)} ر.س</div>
                    {e.reachBoost > 0 && (
                      <div className="text-green">+{Math.round(e.reachBoost * 100)}% وصول</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {rejecting ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-red-700">رفض العرض</h3>
          <p className="text-sm text-red-600">
            يرجى توضيح سبب رفض العرض. هذا سيساعدنا على فهم احتياجاتك بشكل أفضل.
          </p>
          <textarea
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            placeholder="مثلاً: السعر أعلى من الميزانية المتاحة..."
            className="w-full px-4 py-3 rounded-xl border border-red-200 text-sm min-h-[100px] resize-y"
            maxLength={500}
          />
          <div className="flex justify-between text-xs text-red-600">
            <span>الحد الأقصى 500 حرف</span>
            <span>{rejectionReason.length}/500</span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setRejecting(false)
                setRejectionReason('')
              }}
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleReject}
              loading={submitting}
              disabled={!rejectionReason.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              تأكيد الرفض
            </Button>
          </div>
        </div>
      ) : negotiating ? (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-orange-700">طلب التفاوض</h3>
          <p className="text-sm text-orange-600">
            اقترح السعر الذي يناسبك وسبب طلب التفاوض.
          </p>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-2">
              السعر المقترح (ر.س) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={proposedPrice}
              onChange={e => setProposedPrice(e.target.value)}
              placeholder={String(Math.round(quotedPrice * 0.8))}
              className="w-full px-4 py-3 rounded-xl border border-orange-200 text-sm"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-2">
              سبب طلب التفاوض <span className="text-red-500">*</span>
            </label>
            <textarea
              value={negotiationReason}
              onChange={e => setNegotiationReason(e.target.value)}
              placeholder="مثلاً: السعر يتجاوز الميزانية، أو أرى أن القيمة المقترحة مناسبة أكثر..."
              className="w-full px-4 py-3 rounded-xl border border-orange-200 text-sm min-h-[100px] resize-y"
              maxLength={500}
            />
            <div className="flex justify-between text-xs text-orange-600 mt-1">
              <span>الحد الأقصى 500 حرف</span>
              <span>{negotiationReason.length}/500</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setNegotiating(false)
                setNegotiationReason('')
                setProposedPrice('')
              }}
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleNegotiate}
              loading={submitting}
              disabled={!negotiationReason.trim() || !proposedPrice.trim()}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              إرسال طلب التفاوض
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={handleApprove} loading={submitting} className="w-full" size="lg">
            {isFreeFinal
              ? 'اعتماد وبدء التنفيذ 🎁'
              : `اعتماد العرض والانتقال للدفع — ${formatNumber(finalTotal)} ر.س`}
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setNegotiating(true)}
              className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50"
              disabled={submitting}
            >
              💬 طلب التفاوض
            </Button>
            <Button
              variant="outline"
              onClick={() => setRejecting(true)}
              className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
              disabled={submitting}
            >
              ❌ رفض العرض
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
