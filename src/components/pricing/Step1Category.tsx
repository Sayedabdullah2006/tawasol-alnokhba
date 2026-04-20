'use client'

import { cn } from '@/lib/utils'
import type { DBCategory } from '@/lib/hooks'

interface Step1Props {
  selected: string | null
  onSelect: (id: string) => void
  categories: DBCategory[]
  clientType?: string | null
}

export default function Step1Category({ selected, onSelect, categories, clientType }: Step1Props) {
  const filtered = clientType
    ? categories.filter(c => !c.client_types || c.client_types.includes(clientType))
    : categories

  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        ما الذي تريد نشره؟
      </h2>
      <p className="text-sm text-muted text-center mb-6">اختر فئة المحتوى</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
        {filtered.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'p-4 rounded-2xl border-2 text-center transition-all cursor-pointer',
              'hover:shadow-md active:scale-[0.98] min-h-[100px]',
              selected === cat.id
                ? 'border-green bg-green/5 shadow-md'
                : 'border-border bg-card hover:border-green/30'
            )}
          >
            <div className="text-3xl mb-2">{cat.icon}</div>
            <h3 className="font-bold text-dark text-sm">{cat.name_ar}</h3>
            {cat.description && <p className="text-xs text-muted mt-1">{cat.description}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}
