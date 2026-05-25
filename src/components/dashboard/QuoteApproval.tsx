'use client'

import { useState, useMemo, useEffect } from 'react'
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

const MAX_ROUNDS = 3
const ROUND_DISCOUNTS = [5, 10, 15] // نسبة الخصم لكل جولة

interface Props {
  requestId: string
  quotedPrice: number
  offeredExtras: OfferedExtra[]
  influencer: Influencer | null
  scope: 'single' | 'all'
  adminNotes?: string | null
  negotiationRejected?: boolean
  negotiationRound?: number
  quickDiscountPct?: number | null
  quickDiscountDeadline?: string | null
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'انتهى'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days} يوم و ${hours} ساعة`
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function QuoteApproval({
  requestId, quotedPrice, offeredExtras, influencer, scope, adminNotes, negotiationRejected,
  negotiationRound = 0, quickDiscountPct, quickDiscountDeadline,
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

  // Live ticker for countdowns
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const quickDeadlineMs = quickDiscountDeadline ? new Date(quickDiscountDeadline).getTime() : 0
  const quickDiscountActive = !!(quickDiscountPct && quickDeadlineMs > now)

  const discountAmount = quickDiscountActive ? quotedPrice * ((quickDiscountPct ?? 0) / 100) : 0
  const discountedBase = Math.max(0, quotedPrice - discountAmount)

  const extrasTotal = selected.reduce((sum, id) => sum + (extrasMap.get(id)?.price ?? 0), 0)
  const finalTotal = discountedBase + extrasTotal

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
    if (!negotiationReason.trim()) {
      showToast('يرجى كتابة سبب طلب التفاوض', 'error')
      return
    }

    const proposedAmount = proposedPrice.trim() ? parseFloat(proposedPrice) : undefined
    if (proposedAmount !== undefined && (isNaN(proposedAmount) || proposedAmount <= 0)) {
      showToast('يرجى إدخال سعر مقترح صالح', 'error')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/request-negotiation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        negotiationReason: negotiationReason.trim(),
        proposedPrice: proposedAmount ?? null,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const msg = data.isFinal
        ? `✅ عرضنا النهائي: ${formatNumber(data.counterPrice)} ر.س — تحقق من طلبك`
        : `✅ عرض جديد بخصم ${data.discountPct}% — تحقق من طلبك`
      showToast(msg)
      router.push(`/dashboard/${requestId}`)
    } else {
      showToast(data.error ?? 'فشل إرسال طلب التفاوض', 'error')
      setSubmitting(false)
    }
  }

  const isFreeBase = quotedPrice <= 0
  const isFreeFinal = finalTotal <= 0
  const actualValue = Math.round(quotedPrice * 5)

  return (
    <div className="space-y-4">
      {isFreeBase ? (
        <div className="bg-gradient-to-l from-green/15 to-gold/15 border-2 border-gold/40 rounded-2xl p-5 text-center">
          <div className="text-4xl mb-2">🎁</div>
          <p className="font-black text-dark text-lg mb-1">منشور مجاني من تواصل النخبة</p>
          <p className="text-xs text-muted">قدّمت لك الإدارة هذه الخدمة بدون مقابل</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-l from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4">
            <p className="font-bold text-amber-800 text-sm mb-1">✨ وصلك العرض</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              فريقنا من الصياغة والتصميم والنشر سيعمل على هذه الحملة.
              القيمة الفعلية لهذا الجهد تُقدَّر بـ <strong>{formatNumber(actualValue)} ر.س</strong> —
              مساهمتك الرمزية لدعم استمرارنا هي فقط ما ترى أدناه.
            </p>
          </div>
        </>
      )}

      {adminNotes && (
        <div className="bg-cream rounded-xl p-3 text-sm">
          <span className="text-muted block text-xs mb-1">ملاحظة من الإدارة</span>
          <p className="text-dark">{adminNotes}</p>
        </div>
      )}

      {quickDiscountActive && !isFreeBase && (
        <div className="bg-gradient-to-l from-orange-100 to-orange-50 border-2 border-orange-400 rounded-2xl p-4 text-center">
          <p className="font-black text-orange-700 text-base mb-1">🎯 خصم {quickDiscountPct}% للقبول السريع</p>
          <p className="text-xs text-orange-700 mb-2">
            اعتمد العرض الآن ووفّر <strong>{formatNumber(discountAmount)} ر.س</strong>
          </p>
          <div className="inline-block bg-orange-600 text-white text-sm font-bold px-3 py-1 rounded-lg font-mono">
            ⏳ {formatCountdown(quickDeadlineMs - now)}
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-muted text-sm">{isFreeBase ? 'السعر' : 'الخدمة الأساسية'}</span>
          {isFreeBase ? (
            <span className="font-black text-green">مجاني 🎁</span>
          ) : quickDiscountActive ? (
            <span className="font-bold text-dark">
              <span className="line-through text-muted text-sm me-2">{formatNumber(quotedPrice)}</span>
              <span className="text-orange-700">{formatNumber(discountedBase)} ر.س</span>
            </span>
          ) : (
            <span className="font-bold text-dark">{formatNumber(quotedPrice)} ر.س</span>
          )}
        </div>
        {quickDiscountActive && !isFreeBase && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-orange-700">خصم القبول السريع ({quickDiscountPct}%)</span>
            <span className="text-orange-700 font-bold">−{formatNumber(discountAmount)} ر.س</span>
          </div>
        )}
        {extrasTotal > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted">الخدمات الإضافية ({selected.length})</span>
            <span className="text-green">+{formatNumber(extrasTotal)} ر.س</span>
          </div>
        )}
        <div className="border-t border-border pt-3 mt-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-dark">المطلوب دفعه</span>
            {isFreeFinal ? (
              <span className="font-black text-2xl text-green">مجاني</span>
            ) : (
              <span className="font-black text-2xl text-gold">{formatNumber(finalTotal)} ر.س</span>
            )}
          </div>
          {!isFreeFinal && (
            <p className="text-xs text-muted mt-1 text-left">هذا هو المبلغ الكامل — لا رسوم إضافية</p>
          )}
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
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-orange-700">طلب التفاوض</h3>
            <span className="text-xs bg-orange-200 text-orange-800 font-bold px-2 py-1 rounded-full">
              الجولة {negotiationRound + 1} من {MAX_ROUNDS}
            </span>
          </div>

          {/* توقع الرد الآلي */}
          <div className="bg-white border border-orange-200 rounded-xl p-3 text-center">
            <p className="text-xs text-orange-700">
              ⚡ سيصلك رد فوري بخصم{' '}
              <strong>{ROUND_DISCOUNTS[negotiationRound]}%</strong>
              {' '}= <strong>{formatNumber(Math.round(quotedPrice * (1 - ROUND_DISCOUNTS[negotiationRound] / 100)))} ر.س</strong>
              {negotiationRound + 1 === MAX_ROUNDS && ' (عرض نهائي)'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-2">
              سعر مقترح (اختياري)
            </label>
            <input
              type="number"
              value={proposedPrice}
              onChange={e => setProposedPrice(e.target.value)}
              placeholder={`مثلاً: ${Math.round(quotedPrice * (1 - ROUND_DISCOUNTS[negotiationRound] / 100))}`}
              className="w-full px-4 py-3 rounded-xl border border-orange-200 text-sm"
              min="0"
            />
            <p className="text-xs text-orange-500 mt-1">
              إذا كان اقتراحك أفضل لنا من خصم {ROUND_DISCOUNTS[negotiationRound]}% سيُقبل تلقائياً
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-700 mb-2">
              سبب طلب التفاوض <span className="text-red-500">*</span>
            </label>
            <textarea
              value={negotiationReason}
              onChange={e => setNegotiationReason(e.target.value)}
              placeholder="مثلاً: السعر يتجاوز الميزانية المتاحة..."
              className="w-full px-4 py-3 rounded-xl border border-orange-200 text-sm min-h-[80px] resize-y"
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
              onClick={() => { setNegotiating(false); setNegotiationReason(''); setProposedPrice('') }}
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleNegotiate}
              loading={submitting}
              disabled={!negotiationReason.trim()}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              إرسال — الرد فوري ⚡
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={handleApprove} loading={submitting} className="w-full" size="lg">
            {isFreeFinal
              ? 'اعتماد وبدء التنفيذ 🎁'
              : `تأكيد المساهمة والانتقال للدفع — ${formatNumber(finalTotal)} ر.س`}
          </Button>

          {negotiationRejected ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-sm font-medium text-amber-700">
                🔒 وصلت للحد الأقصى ({MAX_ROUNDS} جولات) — السعر نهائي
              </p>
              <p className="text-xs text-amber-600 mt-1">يمكنك اعتماد العرض أو رفضه</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* شريط جولات التفاوض */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-orange-700">جولات التفاوض</span>
                  <span className="text-xs text-orange-600">
                    {negotiationRound}/{MAX_ROUNDS} مستخدمة
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {ROUND_DISCOUNTS.map((disc, i) => {
                    const done = i < negotiationRound
                    const next = i === negotiationRound
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-lg p-1.5 text-center text-xs font-bold border transition-all
                          ${done
                            ? 'bg-orange-200 border-orange-300 text-orange-700 opacity-60'
                            : next
                            ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                            : 'bg-white border-orange-200 text-orange-400'
                          }`}
                      >
                        {done ? '✓' : `${disc}%`}
                        <div className="text-[10px] mt-0.5 font-normal">
                          {done ? 'مكتملة' : next ? 'التالية' : `جولة ${i + 1}`}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {negotiationRound < MAX_ROUNDS && (
                  <p className="text-xs text-orange-600 mt-2 text-center">
                    الجولة القادمة: خصم <strong>{ROUND_DISCOUNTS[negotiationRound]}%</strong> تلقائياً
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => setNegotiating(true)}
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                disabled={submitting}
              >
                💬 طلب التفاوض ({MAX_ROUNDS - negotiationRound} جولة متبقية)
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={() => setRejecting(true)}
            className="w-full border-red-300 text-red-700 hover:bg-red-50"
            disabled={submitting}
          >
            ❌ رفض العرض
          </Button>
        </div>
      )}
    </div>
  )
}
