'use client'

import { cn } from '@/lib/utils'
import type { DBCategory } from '@/lib/hooks'

interface StepSubOptionProps {
  category: DBCategory
  selected: string | null
  onSelect: (opt: string) => void
}

export default function StepSubOption({ category, selected, onSelect }: StepSubOptionProps) {
  if (!category.has_sub_option || !category.sub_options) return null

  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-6">
        {category.sub_option_title ?? 'اختر'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
        {category.sub_options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={cn(
              'p-5 rounded-2xl border-2 text-center transition-all cursor-pointer',
              'hover:shadow-md active:scale-[0.98]',
              selected === opt.id
                ? 'border-green bg-green/5 shadow-md'
                : 'border-border bg-card hover:border-green/30'
            )}
          >
            <span className="text-3xl block mb-2">{opt.icon}</span>
            <span className="font-bold text-dark text-sm block">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
