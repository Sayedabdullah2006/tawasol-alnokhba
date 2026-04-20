'use client'

import { formatNumberShort } from '@/lib/utils'
import type { Influencer } from '@/components/pricing/StepInfluencer'

interface ChannelOption {
  id: 'x' | 'ig' | 'li' | 'tk'
  label: string
  icon: string
  followers: number
}

interface Props {
  influencer: Influencer | null
  selected: string[]
  onToggle: (id: string) => void
}

export default function RStepChannels({ influencer, selected, onToggle }: Props) {
  if (!influencer) return null

  const all: ChannelOption[] = [
    { id: 'x',  label: 'X (تويتر)',  icon: '𝕏', followers: influencer.x_followers ?? 0 },
    { id: 'ig', label: 'Instagram',   icon: '◉', followers: influencer.ig_followers ?? 0 },
    { id: 'li', label: 'LinkedIn',    icon: 'in', followers: influencer.li_followers ?? 0 },
    { id: 'tk', label: 'TikTok',      icon: '▶', followers: influencer.tk_followers ?? 0 },
  ]
  const available = all.filter(c => c.followers > 0)

  const totalReach = selected.reduce((sum, id) => {
    const c = available.find(x => x.id === id)
    return sum + (c?.followers ?? 0)
  }, 0)

  return (
    <div className="wizard-enter max-w-lg mx-auto">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        على أي قنوات تريد النشر؟
      </h2>
      <p className="text-sm text-muted text-center mb-6">
        اختر قناة أو أكثر — كل قناة إضافية توسّع وصول الخبر
      </p>

      <div className="space-y-3">
        {available.map(c => {
          const isSelected = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              className={`w-full text-right flex items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                isSelected ? 'bg-green/5 border-green shadow-sm' : 'bg-white border-border hover:border-green/40'
              }`}
            >
              <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                isSelected ? 'bg-green border-green' : 'border-border'
              }`}>
                {isSelected && <span className="text-white text-sm">✓</span>}
              </div>
              <span className="text-2xl w-8 text-center">{c.icon}</span>
              <div className="flex-1">
                <div className="font-bold text-dark text-sm">{c.label}</div>
                <div className="text-xs text-muted">{formatNumberShort(c.followers)} متابع</div>
              </div>
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="mt-5 bg-green/5 border border-green/20 rounded-xl p-3 text-center text-sm">
          <span className="text-muted">إجمالي الوصول الأساسي: </span>
          <span className="font-black text-green">{formatNumberShort(totalReach)} متابع</span>
        </div>
      )}
    </div>
  )
}
