'use client'

import { cn } from '@/lib/utils'

export type ClientType = 'individual' | 'business' | 'government' | 'charity'

const CLIENT_TYPES: { id: ClientType; icon: string; title: string; desc: string }[] = [
  { id: 'individual', icon: '👤', title: 'فرد', desc: 'شخص طبيعي' },
  { id: 'business', icon: '🏢', title: 'شركة / مؤسسة', desc: 'كيان تجاري أو مؤسسي' },
  { id: 'government', icon: '🏛️', title: 'جهة حكومية', desc: 'خدمة أو إعلان حكومي' },
  { id: 'charity', icon: '❤️', title: 'جمعية خيرية', desc: 'مبادرة أو عمل خيري' },
]

interface Props {
  selected: ClientType | null
  onSelect: (v: ClientType) => void
}

export default function RStep1ClientType({ selected, onSelect }: Props) {
  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">من أنت؟</h2>
      <p className="text-sm text-muted text-center mb-6">حدد نوع الطالب</p>

      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
        {CLIENT_TYPES.map(ct => (
          <button
            key={ct.id}
            onClick={() => onSelect(ct.id)}
            className={cn(
              'p-5 rounded-2xl border-2 text-center transition-all cursor-pointer',
              'hover:shadow-md active:scale-[0.98]',
              selected === ct.id ? 'border-green bg-green/5 shadow-md' : 'border-border bg-card'
            )}
          >
            <div className="text-4xl mb-3">{ct.icon}</div>
            <h3 className="font-bold text-dark text-sm">{ct.title}</h3>
            <p className="text-xs text-muted mt-1">{ct.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
