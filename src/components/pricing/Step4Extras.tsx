'use client'

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
  const filtered = extras.filter(e => !e.category_only || e.category_only === category)

  const getPrice = (ext: DBExtra) => pricingExtras?.[ext.id] ?? ext.default_price

  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        هل تحتاج خدمات إضافية؟
      </h2>
      <p className="text-sm text-muted text-center mb-6">
        اختر ما يناسبك — يمكنك تخطي هذه الخطوة
      </p>

      <div className="space-y-2 max-w-lg mx-auto">
        {filtered.map(extra => (
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

      {showPrices && selected.length > 0 && (
        <div className="mt-4 text-center">
          <span className="text-sm text-muted">إجمالي المزايا المختارة: </span>
          <span className="font-bold text-green">
            {filtered.filter(e => selected.includes(e.id)).reduce((s, e) => s + getPrice(e), 0)} ر.س
          </span>
        </div>
      )}
    </div>
  )
}
