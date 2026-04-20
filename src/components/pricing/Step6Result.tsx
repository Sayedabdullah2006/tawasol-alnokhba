'use client'

import { type PriceBreakdown } from '@/lib/pricing-engine'
import { CATEGORIES } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import type { Influencer } from './StepInfluencer'

interface Step6Props {
  breakdown: PriceBreakdown
  scope: string
  images: string
  numPosts: number
  extrasCount: number
  influencer?: Influencer | null
}

export default function Step6Result({ breakdown, scope, images, numPosts, extrasCount, influencer }: Step6Props) {
  const b = breakdown
  const catName = CATEGORIES.find(c => c.id === b.category)?.nameAr ?? b.category

  return (
    <div className="wizard-enter max-w-lg mx-auto">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        عرضك السعري المخصص
      </h2>
      <p className="text-sm text-muted text-center mb-6">بناءً على اختياراتك — مخصص لك</p>

      <div className="price-pop bg-card rounded-2xl border border-border overflow-hidden">
        {/* Summary */}
        <div className="p-5 border-b border-border space-y-2 text-sm">
          <h3 className="font-bold text-dark mb-3">ملخص اختياراتك</h3>
          {influencer && (
            <div className="flex justify-between">
              <span className="text-muted">المؤثر:</span>
              <span className="font-medium">{influencer.name_ar}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">الفئة:</span>
            <span className="font-medium">{catName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">النشر:</span>
            <span className="font-medium">{scope === 'single' ? 'X فقط' : 'جميع القنوات'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">الصور:</span>
            <span className="font-medium">{images === 'one' ? 'صورة واحدة' : '2-4 صور'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">مزايا إضافية:</span>
            <span className="font-medium">{extrasCount} ميزة</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">عدد المنشورات:</span>
            <span className="font-medium">{numPosts} منشور</span>
          </div>
        </div>

        {/* Price breakdown */}
        <div className="p-5 space-y-2 text-sm">
          <h3 className="font-bold text-dark mb-3">تفصيل السعر</h3>

          {b.isFree ? (
            <div className="flex justify-between text-green font-bold">
              <span>نشر مجاني</span>
              <span>0 ر.س</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-muted">
                  السعر الأساسي
                  {b.scopeMultiplier === 1 && b.imageMultiplier === 1
                    ? ' (قناة واحدة · صورة واحدة)'
                    : ''}
                </span>
                <span>{formatNumber(b.basePrice)} ر.س</span>
              </div>

              {/* نطاق النشر — يظهر فقط عند اختيار جميع القنوات */}
              {b.basePrice > 0 && b.scopeMultiplier > 1 && (
                <div className="flex justify-between">
                  <span className="text-muted">نشر في جميع القنوات (×{b.scopeMultiplier})</span>
                  <span>{formatNumber(b.afterScope)} ر.س</span>
                </div>
              )}

              {/* عدد الصور — يظهر فقط عند اختيار صور متعددة */}
              {b.basePrice > 0 && b.imageMultiplier > 1 && (
                <div className="flex justify-between">
                  <span className="text-muted">صور متعددة (×{b.imageMultiplier})</span>
                  <span>{formatNumber(b.afterImages)} ر.س</span>
                </div>
              )}

              {b.isHalfOff && (
                <div className="flex justify-between text-gold">
                  <span>خصم خاص −50%</span>
                  <span>−{formatNumber(b.afterImages * 0.5)} ر.س</span>
                </div>
              )}
            </>
          )}

          {/* Extras */}
          {b.extrasDetail.length > 0 && (
            <>
              {b.extrasDetail.map(e => (
                <div key={e.id} className="flex justify-between text-sm">
                  <span className="text-muted">+ {e.name}</span>
                  <span>+{formatNumber(e.price)} ر.س</span>
                </div>
              ))}
            </>
          )}

          <div className="border-t border-border pt-2 flex justify-between font-medium">
            <span>سعر المنشور الواحد</span>
            <span>{formatNumber(b.perPostPrice)} ر.س</span>
          </div>

          {numPosts > 1 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted">× {numPosts} منشورات</span>
                <span>{formatNumber(b.subtotalBeforeDiscount)} ر.س</span>
              </div>
              {b.discountPct > 0 && (
                <div className="flex justify-between text-gold">
                  <span>خصم {b.discountPct}%</span>
                  <span>−{formatNumber(b.discountAmount)} ر.س</span>
                </div>
              )}
            </>
          )}

          <div className="border-t border-border pt-2 flex justify-between">
            <span className="text-muted">المجموع قبل الضريبة</span>
            <span>{formatNumber(b.subtotalAfterDiscount)} ر.س</span>
          </div>

          {b.totalFinal > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">ضريبة القيمة المضافة 15%</span>
              <span>+{formatNumber(b.vatAmount)} ر.س</span>
            </div>
          )}

          <div className="border-t-2 border-gold pt-3 mt-3 flex justify-between items-center">
            <span className="text-lg font-black text-dark">💰 الإجمالي</span>
            <span className="text-2xl font-black text-gold">{formatNumber(b.totalFinal)} ر.س</span>
          </div>

          {numPosts > 1 && (
            <p className="text-center text-xs text-muted mt-1">
              يعادل {formatNumber(b.perPostFinal)} ر.س للمنشور الواحد
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
