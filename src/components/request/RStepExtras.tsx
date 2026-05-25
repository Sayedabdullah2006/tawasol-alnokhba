'use client'

import { AQ_EXTRAS_PRICES, AQ_EXTRAS_NAMES, AQ_EXTRAS_ICONS, AQ_EXTRAS_LIST } from '@/lib/auto-quote'
import { formatNumber } from '@/lib/utils'

interface Props {
  selected: string[]
  onChange: (extras: string[]) => void
  basePrice: number
  baseLabel?: string
}

export default function RStepExtras({ selected, onChange, basePrice, baseLabel }: Props) {
  const toggle = (id: string) => {
    // pin6 و pin12 متعارضان
    if (id === 'pin6' && !selected.includes('pin6')) {
      onChange([...selected.filter(e => e !== 'pin12'), 'pin6'])
      return
    }
    if (id === 'pin12' && !selected.includes('pin12')) {
      onChange([...selected.filter(e => e !== 'pin6'), 'pin12'])
      return
    }
    onChange(
      selected.includes(id) ? selected.filter(e => e !== id) : [...selected, id]
    )
  }

  const extrasTotal = selected.reduce((s, id) => s + (AQ_EXTRAS_PRICES[id] ?? 0), 0)
  const total       = basePrice + extrasTotal

  return (
    <div className="wizard-enter max-w-lg mx-auto pb-2">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-1">
        أضف خدمات إضافية
      </h2>
      <p className="text-sm text-muted text-center mb-5">
        اختياري — يمكن تخطي هذه الخطوة بالضغط على "التالي"
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {AQ_EXTRAS_LIST.map(id => {
          const isSelected = selected.includes(id)
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`
                relative text-right p-3 rounded-xl border-2 transition-all
                ${isSelected
                  ? 'border-green bg-green/5'
                  : 'border-border bg-card hover:border-green/40'
                }
              `}
            >
              {isSelected && (
                <span className="absolute top-2 left-2 w-5 h-5 bg-green rounded-full flex items-center justify-center text-white text-xs font-bold leading-none">
                  ✓
                </span>
              )}
              <div className="text-xl mb-1">{AQ_EXTRAS_ICONS[id]}</div>
              <div className="text-sm font-semibold text-dark leading-tight mb-1">
                {AQ_EXTRAS_NAMES[id]}
              </div>
              <div className="text-xs font-bold text-green">
                +{formatNumber(AQ_EXTRAS_PRICES[id])} ر.س
              </div>
            </button>
          )
        })}
      </div>

      {/* ملخص السعر الحي */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-2 text-sm">
        <div className="flex justify-between text-muted">
          <span>{baseLabel ?? 'السعر الأساسي'}</span>
          <span>{formatNumber(basePrice)} ر.س</span>
        </div>
        {extrasTotal > 0 && (
          <div className="flex justify-between text-muted">
            <span>الخدمات الإضافية ({selected.length})</span>
            <span>+{formatNumber(extrasTotal)} ر.س</span>
          </div>
        )}
        <div className="flex justify-between font-black text-dark text-base border-t border-border pt-2 mt-1">
          <span>الإجمالي</span>
          <span className="text-green">{formatNumber(total)} ر.س</span>
        </div>
      </div>
    </div>
  )
}
