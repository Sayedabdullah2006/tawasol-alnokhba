'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { calculateReach, EXTRAS_REACH_BOOST } from '@/lib/pricing-engine'
import { useExtras } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import { formatNumber, formatNumberShort } from '@/lib/utils'

interface OfferedExtra {
  id: string
  name: string
  price: number
  reachBoost: number
}

interface Influencer {
  id?: string
  x_followers?: number | null
  ig_followers?: number | null
  li_followers?: number | null
  tk_followers?: number | null
}

interface Props {
  requestId: string
  category: string
  basePrice: number
  initialSelected: string[]
  offered: OfferedExtra[]
  influencer: Influencer | null
  scope: 'single' | 'all'
  onUpdated?: (newTotal: number, newReach: number, newSelected: string[]) => void
}

export default function EditableExtras({
  requestId, category, basePrice, initialSelected, offered, influencer, scope, onUpdated,
}: Props) {
  const supabase = createClient()
  const { showToast } = useToast()
  const { extras: dbExtras, loading: extrasLoading } = useExtras()
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string[]>(initialSelected)
  const [showExtras, setShowExtras] = useState(false)
  const [showPopup, setShowPopup] = useState(false)

  // Load per-influencer pricing config (only needed for fallback list)
  useEffect(() => {
    if (offered.length > 0 || !influencer?.id) return
    supabase
      .from('pricing_config').select('extras_prices').eq('influencer_id', influencer.id).single()
      .then(({ data }) => { if (data) setPricingConfig(data) })
  }, [offered.length, influencer?.id, supabase])

  // Resolve the list shown to the user:
  //   1. Admin-offered extras (preferred)
  //   2. Else: all active DB extras filtered by category, priced from influencer config or default
  const available: OfferedExtra[] = useMemo(() => {
    let extras: OfferedExtra[] = []

    if (offered.length > 0) {
      extras = offered
    } else {
      extras = dbExtras
        .filter(e => !e.category_only || e.category_only === category)
        .map(e => ({
          id: e.id,
          name: e.name_ar,
          price: pricingConfig?.extras_prices?.[e.id] ?? e.default_price,
          reachBoost: EXTRAS_REACH_BOOST[e.id] ?? 0,
        }))
    }

    // عكس الترتيب - ابدأ بالتثبيت، إعادة نشر، إلخ
    return extras.reverse()
  }, [offered, dbExtras, pricingConfig, category])

  const availableMap = useMemo(() => new Map(available.map(e => [e.id, e])), [available])

  const extrasTotal = selected.reduce((sum, id) => sum + (availableMap.get(id)?.price ?? 0), 0)
  const finalTotal = basePrice + extrasTotal

  const reach = useMemo(() => {
    if (!influencer) return 0
    return calculateReach({ influencer, scope, extras: selected })
  }, [influencer, scope, selected])

  useEffect(() => {
    const same = lastSaved.length === selected.length && lastSaved.every(x => selected.includes(x))
    if (same) return

    const t = setTimeout(async () => {
      setSaving(true)
      const res = await fetch('/api/approve-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, selectedExtras: selected }),
      })
      if (res.ok) {
        setLastSaved(selected)
        const { data } = await supabase
          .from('publish_requests')
          .select('final_total, estimated_reach, user_selected_extras')
          .eq('id', requestId)
          .single()
        if (data && onUpdated) {
          onUpdated(
            Number(data.final_total ?? finalTotal),
            Number(data.estimated_reach ?? reach),
            (data.user_selected_extras ?? selected) as string[]
          )
        }
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? 'تعذّر تحديث الخدمات الإضافية', 'error')
        setSelected(lastSaved)
      }
      setSaving(false)
    }, 600)

    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleToggleExtras = () => {
    if (!showExtras) {
      setShowPopup(true)
    } else {
      setShowExtras(false)
    }
  }

  const confirmShowExtras = () => {
    setShowPopup(false)
    setShowExtras(true)
  }

  const cancelShowExtras = () => {
    setShowPopup(false)
  }

  if (extrasLoading) {
    return <div className="bg-card rounded-2xl border border-border p-5 text-sm text-muted text-center">جارٍ تحميل الخدمات...</div>
  }

  return (
    <>
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-dark">الخدمات الإضافية</h3>
            <p className="text-xs text-muted mt-0.5">
              {showExtras ? 'اختر ما تحتاج — السعر والوصول يتحدّثان فورياً' : 'خدمات اختيارية لضمان وصول أكبر'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-muted">جارٍ الحفظ...</span>}
            <button
              onClick={handleToggleExtras}
              className="text-sm text-green hover:text-green/80 font-medium transition-colors"
            >
              {showExtras ? 'إخفاء الخدمات' : 'عرض الخدمات الإضافية'}
            </button>
          </div>
        </div>

      {showExtras && (
        available.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">لا توجد خدمات إضافية متاحة حالياً</p>
        ) : (
        <div className="space-y-2">
          {/* أول 5 خدمات - عرض مباشر */}
          {available.slice(0, 5).map(e => {
            const isSelected = selected.includes(e.id)
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className={`w-full text-right flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected ? 'bg-green/5 border-green shadow-sm' : 'bg-white border-border hover:border-green/40'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-green border-green' : 'border-border'
                }`}>
                  {isSelected && <span className="text-white text-xs">✓</span>}
                </div>
                <span className="flex-1 text-sm font-medium text-dark">{e.name}</span>
                <div className="text-xs space-y-0.5 text-left">
                  <div className="text-gold font-bold">+{formatNumber(e.price)} ر.س</div>
                  {e.reachBoost > 0 && (
                    <div className="text-green">+{Math.round(e.reachBoost * 100)}% وصول</div>
                  )}
                </div>
              </button>
            )
          })}

          {/* باقي الخدمات - منطقة تمرير */}
          {available.length > 5 && (
            <div className="max-h-48 overflow-y-auto space-y-2 border-t border-border pt-2">
              <p className="text-xs text-muted text-center pb-1">مرر لأسفل للمزيد من الخدمات</p>
              {available.slice(5).map(e => {
                const isSelected = selected.includes(e.id)
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggle(e.id)}
                    className={`w-full text-right flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected ? 'bg-green/5 border-green shadow-sm' : 'bg-white border-border hover:border-green/40'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-green border-green' : 'border-border'
                    }`}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="flex-1 text-sm font-medium text-dark">{e.name}</span>
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
          )}
        </div>
        )
      )}

      <div className="border-t border-border pt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">السعر الرئيسي</span>
          <span>{formatNumber(basePrice)} ر.س</span>
        </div>
        {extrasTotal > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">خدمات إضافية ({selected.length})</span>
            <span className="text-green">+{formatNumber(extrasTotal)} ر.س</span>
          </div>
        )}
        <div className="flex justify-between font-bold pt-2 border-t border-border">
          <span>الإجمالي</span>
          <span className="text-2xl text-gold">{formatNumber(finalTotal)} ر.س</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">الوصول المتوقع</span>
          <span className="font-bold text-green">{formatNumberShort(reach)} متابع</span>
        </div>
      </div>
      </div>

      {/* Popup تنويهي للخدمات الإضافية */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 border border-border">
            <div className="text-center">
              <div className="text-4xl mb-3">🚀</div>
              <h3 className="font-bold text-dark text-lg mb-2">هل ترغب في خدمات إضافية؟</h3>
              <p className="text-sm text-muted mb-6">
                يمكنك إضافة خدمات إضافية لضمان وصول أكبر وتفاعل أفضل مع المحتوى
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={cancelShowExtras}
                className="px-4 py-2 rounded-xl border border-border text-muted hover:bg-cream transition-colors"
              >
                لا، شكراً
              </button>
              <button
                onClick={confirmShowExtras}
                className="px-4 py-2 rounded-xl bg-green text-white hover:bg-green/90 transition-colors"
              >
                نعم، أريد المزيد
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
