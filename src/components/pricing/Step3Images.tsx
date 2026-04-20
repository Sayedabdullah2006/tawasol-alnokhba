'use client'

import { cn } from '@/lib/utils'

interface Step3Props {
  selected: 'one' | 'multi' | null
  onSelect: (v: 'one' | 'multi') => void
}

export default function Step3Images({ selected, onSelect }: Step3Props) {
  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        كم صورة ستُرفق مع المنشور؟
      </h2>
      <p className="text-sm text-muted text-center mb-6">اختر عدد الصور</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        <button
          onClick={() => onSelect('one')}
          className={cn(
            'p-6 rounded-2xl border-2 text-center transition-all cursor-pointer',
            'hover:shadow-md active:scale-[0.98]',
            selected === 'one'
              ? 'border-green bg-green/5 shadow-md'
              : 'border-border bg-card hover:border-green/30'
          )}
        >
          <div className="text-4xl mb-3">🖼️</div>
          <h3 className="font-bold text-dark">صورة واحدة</h3>
          <p className="text-sm text-muted mt-1">صورة رئيسية للخبر</p>
        </button>

        <button
          onClick={() => onSelect('multi')}
          className={cn(
            'p-6 rounded-2xl border-2 text-center transition-all cursor-pointer',
            'hover:shadow-md active:scale-[0.98]',
            selected === 'multi'
              ? 'border-green bg-green/5 shadow-md'
              : 'border-border bg-card hover:border-green/30'
          )}
        >
          <div className="text-4xl mb-3">🖼️🖼️</div>
          <h3 className="font-bold text-dark">2 – 4 صور</h3>
          <p className="text-sm text-muted mt-1">مجموعة صور للخبر</p>
        </button>
      </div>
    </div>
  )
}
