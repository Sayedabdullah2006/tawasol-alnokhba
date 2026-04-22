'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DBExtra } from '@/lib/hooks'

interface Step4Props {
  selected: string[]
  onToggle: (id: string) => void
  showPrices?: boolean
  category?: string | null
  extras: DBExtra[]
  pricingExtras?: Record<string, number>
}

export default function Step4Extras({ selected, onToggle, showPrices = false, category, extras, pricingExtras }: Step4Props) {
  const [showExtras, setShowExtras] = useState(false)
  const [showPopup, setShowPopup] = useState(false)

  const filtered = extras
    .filter(e => !e.category_only || e.category_only === category)
    .reverse() // عكس الترتيب - ابدأ بالتثبيت، إعادة نشر، إلخ

  const getPrice = (ext: DBExtra) => pricingExtras?.[ext.id] ?? ext.default_price

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

  return (
    <>
      <div className="wizard-enter">
        <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
          هل تحتاج خدمات إضافية؟
        </h2>
        <p className="text-sm text-muted text-center mb-4">
          {showExtras ? 'اختر ما يناسبك — يمكنك تخطي هذه الخطوة' : 'خدمات اختيارية لضمان وصول أكبر وتفاعل أفضل'}
        </p>

        {/* زر عرض/إخفاء الخدمات */}
        <div className="text-center mb-6">
          <button
            onClick={handleToggleExtras}
            className="text-green hover:text-green/80 font-medium transition-colors text-sm border border-green rounded-xl px-4 py-2"
          >
            {showExtras ? 'إخفاء الخدمات الإضافية' : 'عرض الخدمات الإضافية 🚀'}
          </button>
        </div>

      {showExtras && (
        <div className="space-y-2 max-w-lg mx-auto">
        {/* أول 5 خدمات - عرض مباشر */}
        {filtered.slice(0, 5).map(extra => (
          <button
            key={extra.id}
            onClick={() => onToggle(extra.id)}
            className={cn(
              'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer text-right',
              'hover:shadow-sm active:scale-[0.99]',
              selected.includes(extra.id)
                ? 'border-green bg-green/5'
                : 'border-border bg-card hover:border-green/30'
            )}
          >
            <div className={cn(
              'w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all',
              selected.includes(extra.id)
                ? 'bg-green border-green text-white'
                : 'border-border'
            )}>
              {selected.includes(extra.id) && <span className="text-sm">✓</span>}
            </div>
            <span className="text-xl">{extra.icon}</span>
            <span className="font-medium text-dark flex-1">{extra.name_ar}</span>
            {showPrices && (
              <span className="text-sm font-bold text-green">{getPrice(extra)} ر.س</span>
            )}
          </button>
        ))}

        {/* باقي الخدمات - منطقة تمرير */}
        {filtered.length > 5 && (
          <div className="max-h-64 overflow-y-auto space-y-2 border-t border-border pt-3 mt-3">
            <p className="text-xs text-muted text-center pb-2">مرر لأسفل للمزيد من الخدمات</p>
            {filtered.slice(5).map(extra => (
              <button
                key={extra.id}
                onClick={() => onToggle(extra.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer text-right',
                  'hover:shadow-sm active:scale-[0.99]',
                  selected.includes(extra.id)
                    ? 'border-green bg-green/5'
                    : 'border-border bg-card hover:border-green/30'
                )}
              >
                <div className={cn(
                  'w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all',
                  selected.includes(extra.id)
                    ? 'bg-green border-green text-white'
                    : 'border-border'
                )}>
                  {selected.includes(extra.id) && <span className="text-sm">✓</span>}
                </div>
                <span className="text-xl">{extra.icon}</span>
                <span className="font-medium text-dark flex-1">{extra.name_ar}</span>
                {showPrices && (
                  <span className="text-sm font-bold text-green">{getPrice(extra)} ر.س</span>
                )}
              </button>
            ))}
          </div>
        )}
        </div>
      )}

      {showPrices && selected.length > 0 && (
        <div className="mt-4 text-center">
          <span className="text-sm text-muted">إجمالي المزايا المختارة: </span>
          <span className="font-bold text-green">
            {filtered.filter(e => selected.includes(e.id)).reduce((s, e) => s + getPrice(e), 0)} ر.س
          </span>
        </div>
      )}
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
