'use client'

import { cn, formatNumberShort } from '@/lib/utils'
import { PLATFORMS } from '@/lib/constants'
import type { Influencer } from './StepInfluencer'

interface Step2Props {
  selected: 'single' | 'all' | null
  onSelect: (scope: 'single' | 'all') => void
  influencer?: Influencer | null
}

export default function Step2Scope({ selected, onSelect, influencer }: Step2Props) {
  const xFollowers = influencer?.x_followers ?? 330000
  const igFollowers = influencer?.ig_followers ?? 145000
  const liFollowers = influencer?.li_followers ?? 81000
  const tkFollowers = influencer?.tk_followers ?? 26000
  const total = xFollowers + igFollowers + liFollowers + tkFollowers

  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        أين تريد النشر؟
      </h2>
      <p className="text-sm text-muted text-center mb-6">اختر نطاق النشر</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {/* X only */}
        <button
          onClick={() => onSelect('single')}
          className={cn(
            'p-6 rounded-2xl border-2 text-center transition-all cursor-pointer',
            'hover:shadow-md active:scale-[0.98]',
            selected === 'single'
              ? 'border-green bg-green/5 shadow-md'
              : 'border-border bg-card hover:border-green/30'
          )}
        >
          <div className="text-4xl mb-2 font-black">𝕏</div>
          <h3 className="font-bold text-dark text-lg mb-1">قناة X (تويتر)</h3>
          <p className="text-sm text-muted mb-3">المنصة الأقوى تأثيراً في السعودية</p>
          <p className="text-lg font-black text-green">+{formatNumberShort(xFollowers)} متابع</p>
        </button>

        {/* All channels */}
        <button
          onClick={() => onSelect('all')}
          className={cn(
            'p-6 rounded-2xl border-2 text-center transition-all cursor-pointer',
            'hover:shadow-md active:scale-[0.98]',
            selected === 'all'
              ? 'border-green bg-green/5 shadow-md'
              : 'border-border bg-card hover:border-green/30'
          )}
        >
          <div className="flex justify-center gap-2 text-2xl mb-2">
            {PLATFORMS.map(p => (
              <span key={p.id} style={{ color: p.color }} className="font-bold">{p.name}</span>
            ))}
          </div>
          <h3 className="font-bold text-dark text-lg mb-1">جميع القنوات</h3>
          <p className="text-sm text-muted mb-3">أقصى وصول ممكن</p>

          <div className="space-y-1.5 mb-3">
            {[
              { label: '𝕏', val: xFollowers, color: '#1D1D1D', max: total },
              { label: '◉', val: igFollowers, color: '#E1306C', max: total },
              { label: 'in', val: liFollowers, color: '#0077B5', max: total },
              { label: '▶', val: tkFollowers, color: '#69C9D0', max: total },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-2">
                <span className="w-5 text-xs font-bold" style={{ color: p.color }}>{p.label}</span>
                <div className="flex-1 h-2 bg-border/30 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(p.val / xFollowers) * 100}%`, backgroundColor: p.color }} />
                </div>
                <span className="text-xs font-medium text-dark min-w-[35px] text-left" dir="ltr">
                  {formatNumberShort(p.val)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-lg font-black text-green">+{formatNumberShort(total)} متابع حقيقي</p>
        </button>
      </div>
    </div>
  )
}
