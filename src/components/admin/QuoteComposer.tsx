'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { calculatePrice, calculateReach, EXTRAS_REACH_BOOST } from '@/lib/pricing-engine'
import { useExtras } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import { formatNumber, formatNumberShort } from '@/lib/utils'
import Button from '@/components/ui/Button'

interface Props {
  request: any
  onSent: () => void
  onCancel: () => void
}

export default function QuoteComposer({ request, onSent, onCancel }: Props) {
  const supabase = createClient()
  const { showToast } = useToast()
  const { extras: dbExtras, loading: extrasLoading } = useExtras()

  const [influencer, setInfluencer] = useState<any>(null)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Admin-editable inputs — defaults derived from user-chosen channels
  const userChannels: string[] = Array.isArray(request.channels) ? request.channels : []
  const initialScope: 'single' | 'all' = userChannels.length > 1 ? 'all' : 'single'
  const [scope, setScope] = useState<'single' | 'all'>(request.scope ?? initialScope)
  const [images, setImages] = useState<'one' | 'multi'>(request.images ?? 'one')
  const [numPosts, setNumPosts] = useState<number>(request.num_posts ?? 1)
  const [manualPrice, setManualPrice] = useState<string>('')
  const [isFree, setIsFree] = useState(false)
  const [selectedExtrasToOffer, setSelectedExtrasToOffer] = useState<string[]>([])
  const [adminNotes, setAdminNotes] = useState(request.admin_notes ?? '')

  useEffect(() => {
    const load = async () => {
      if (request.influencer_id) {
        const { data: inf } = await supabase
          .from('influencers').select('*').eq('id', request.influencer_id).single()
        setInfluencer(inf)

        const { data: pc } = await supabase
          .from('pricing_config').select('*').eq('influencer_id', request.influencer_id).single()
        if (pc) setPricingConfig(pc)
      }
      setLoading(false)
    }
    load()
  }, [request.influencer_id, supabase])

  // Auto-calculated price (no extras — extras are offered separately)
  const autoBreakdown = useMemo(() => {
    try {
      return calculatePrice({
        category: request.category,
        subOption: request.sub_option,
        scope, images,
        extras: [],
        numPosts,
        influencerPriceMultiplier: influencer?.price_multiplier ?? 1.0,
      })
    } catch {
      return null
    }
  }, [request.category, request.sub_option, scope, images, numPosts, influencer])

  const autoPrice = autoBreakdown?.totalFinal ?? 0
  const effectivePrice = isFree ? 0 : (manualPrice !== '' ? parseFloat(manualPrice) : autoPrice)

  const baseReach = useMemo(() => {
    if (!influencer) return 0
    return calculateReach({ influencer, scope, extras: [] })
  }, [influencer, scope])

  // Extras pricing — per-influencer config first, else category-filtered defaults
  const availableExtras = useMemo(() => {
    return dbExtras
      .filter(e => !e.category_only || e.category_only === request.category)
      .map(e => ({
        id: e.id,
        name: e.name_ar,
        icon: e.icon,
        price: pricingConfig?.extras_prices?.[e.id] ?? e.default_price,
        reachBoost: EXTRAS_REACH_BOOST[e.id] ?? 0,
      }))
  }, [dbExtras, pricingConfig, request.category])

  const toggleOffered = (id: string) => {
    setSelectedExtrasToOffer(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSend = async () => {
    if (effectivePrice < 0 || (!isFree && !effectivePrice)) {
      showToast('أدخل سعراً صحيحاً أو فعّل خيار "مجاني"', 'error')
      return
    }
    if (isFree && !adminNotes.trim()) {
      showToast('اكتب رسالة للعميل توضّح سبب جعل المنشور مجانياً', 'error')
      return
    }
    setSaving(true)

    const offeredExtras = availableExtras
      .filter(e => selectedExtrasToOffer.includes(e.id))
      .map(e => ({
        id: e.id,
        name: e.name,
        price: e.price,
        reachBoost: e.reachBoost,
      }))

    const res = await fetch('/api/send-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: request.id,
        quotedPrice: effectivePrice,
        offeredExtras,
        adminNotes: adminNotes || null,
        baseReach,
      }),
    })

    if (res.ok) {
      showToast('تم إرسال العرض للعميل')
      onSent()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل إرسال العرض', 'error')
    }
    setSaving(false)
  }

  if (loading || extrasLoading) return <p className="text-sm text-muted">جارٍ التحميل...</p>

  return (
    <div className="space-y-4">
      {userChannels.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
          <span className="text-blue-700 font-bold">القنوات التي اختارها العميل: </span>
          <span className="text-blue-600">
            {userChannels.map(c => ({ x: 'X', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok' } as Record<string, string>)[c] ?? c).join('، ')}
          </span>
        </div>
      )}

      <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
        isFree ? 'bg-green/5 border-green' : 'bg-white border-border hover:border-green/40'
      }`}>
        <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)}
          className="w-5 h-5 accent-green cursor-pointer" />
        <div className="flex-1">
          <div className="font-bold text-dark text-sm">🎁 جعل المنشور مجانياً للعميل</div>
          <div className="text-xs text-muted mt-0.5">السعر يصبح 0 ر.س ولن يحتاج العميل للدفع — اكتب رسالة في الأسفل توضّح السبب</div>
        </div>
      </label>

      <div className={`bg-cream rounded-xl p-4 space-y-3 ${isFree ? 'opacity-50 pointer-events-none' : ''}`}>
        <h3 className="font-bold text-dark text-sm">إعدادات الحاسبة</h3>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-muted block mb-1">نطاق النشر</label>
            <select value={scope} onChange={e => setScope(e.target.value as 'single' | 'all')}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm">
              <option value="single">X فقط</option>
              <option value="all">جميع القنوات</option>
            </select>
          </div>
          <div>
            <label className="text-muted block mb-1">عدد الصور</label>
            <select value={images} onChange={e => setImages(e.target.value as 'one' | 'multi')}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm">
              <option value="one">صورة واحدة</option>
              <option value="multi">2-4 صور</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-muted block mb-1">عدد المنشورات</label>
            <input type="number" min={1} value={numPosts}
              onChange={e => setNumPosts(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted">السعر التلقائي من الحاسبة:</span>
            <span className="font-bold text-gold">{formatNumber(autoPrice)} ر.س</span>
          </div>
          {autoBreakdown && (
            <div className="text-xs text-muted space-y-0.5 pt-2 border-t border-border mt-2">
              <div>الأساس: {formatNumber(autoBreakdown.basePrice)} · نطاق ×{autoBreakdown.scopeMultiplier} · صور ×{autoBreakdown.imageMultiplier}</div>
              {autoBreakdown.discountPct > 0 && <div>خصم {autoBreakdown.discountPct}% = −{formatNumber(autoBreakdown.discountAmount)}</div>}
              <div>ضريبة 15% = +{formatNumber(autoBreakdown.vatAmount)}</div>
            </div>
          )}
        </div>

        <div>
          <label className="text-muted block mb-1 text-sm">تعديل السعر يدوياً (اختياري)</label>
          <input type="number" min={0} step="0.01" value={manualPrice}
            onChange={e => setManualPrice(e.target.value)}
            placeholder={`اتركه فارغاً لاعتماد ${formatNumber(autoPrice)}`}
            className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm" />
        </div>
      </div>

      <div className="bg-cream rounded-xl p-4">
        <h3 className="font-bold text-dark text-sm mb-1">الخدمات الإضافية المعروضة</h3>
        <p className="text-xs text-muted mb-3">اختر الخدمات التي سيراها العميل في شاشة العرض</p>

        <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto">
          {availableExtras.map(e => (
            <label key={e.id}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                selectedExtrasToOffer.includes(e.id) ? 'bg-green/5 border-green' : 'bg-white border-border'
              }`}>
              <input type="checkbox" checked={selectedExtrasToOffer.includes(e.id)}
                onChange={() => toggleOffered(e.id)} />
              <span className="text-lg">{e.icon}</span>
              <span className="flex-1 text-sm">{e.name}</span>
              <span className="text-xs text-muted">+{formatNumber(e.price)} ر.س</span>
              {e.reachBoost > 0 && (
                <span className="text-xs text-green">+{Math.round(e.reachBoost * 100)}% وصول</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-cream rounded-xl p-4 text-sm space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-muted">السعر المرسل:</span>
          {isFree ? (
            <span className="font-black text-green text-lg">مجاني 🎁</span>
          ) : (
            <span className="font-bold text-gold text-lg">{formatNumber(effectivePrice)} ر.س</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-muted">الوصول الأساسي المتوقع:</span>
          <span className="font-medium">{formatNumberShort(baseReach)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">خدمات معروضة:</span>
          <span className="font-medium">{selectedExtrasToOffer.length}</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-dark block mb-1">
          {isFree ? 'رسالة للعميل *' : 'ملاحظات للعميل (اختياري)'}
        </label>
        <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm min-h-[80px] resize-y"
          placeholder={isFree ? 'مثلاً: تم منحك خدمة مجانية كهدية ترحيبية...' : 'مثلاً: تم تعديل السعر بسبب...'} />
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onCancel} className="flex-1">إلغاء</Button>
        <Button onClick={handleSend} loading={saving} className="flex-1">إرسال العرض</Button>
      </div>
    </div>
  )
}
