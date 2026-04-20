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
    if (offered.length > 0) return offered
    return dbExtras
      .filter(e => !e.category_only || e.category_only === category)
      .map(e => ({
        id: e.id,
        name: e.name_ar,
        price: pricingConfig?.extras_prices?.[e.id] ?? e.default_price,
        reachBoost: EXTRAS_REACH_BOOST[e.id] ?? 0,
      }))
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

  if (extrasLoading) {
    return <div className="bg-card rounded-2xl border border-border p-5 text-sm text-muted text-center">جارٍ تحميل الخدمات...</div>
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-dark">الخدمات الإضافية</h3>
          <p className="text-xs text-muted mt-0.5">اختر ما تحتاج — السعر والوصول يتحدّثان فورياً</p>
        </div>
        {saving && <span className="text-xs text-muted">جارٍ الحفظ...</span>}
      </div>

      {available.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">لا توجد خدمات إضافية متاحة حالياً</p>
      ) : (
        <div className="space-y-2">
          {available.map(e => {
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
  )
}
