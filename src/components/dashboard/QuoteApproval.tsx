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
      showToast(data.error ?? 'فشل اعتماد التسعيرة', 'error')
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
          <p className="font-bold text-blue-700 text-sm mb-1">💰 وصلتك التسعيرة</p>
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

      {offeredExtras.length > 0 && (
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

      <Button onClick={handleApprove} loading={submitting} className="w-full" size="lg">
        {isFreeFinal
          ? 'اعتماد وبدء التنفيذ 🎁'
          : `اعتماد التسعيرة والانتقال للدفع — ${formatNumber(finalTotal)} ر.س`}
      </Button>
    </div>
  )
}
