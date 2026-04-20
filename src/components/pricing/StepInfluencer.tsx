'use client'

import { cn } from '@/lib/utils'
import { formatNumberShort } from '@/lib/utils'

export interface Influencer {
  id: string
  name_ar: string
  name_en: string | null
  x_handle: string | null
  x_followers: number
  ig_followers: number
  li_followers: number
  tk_followers: number
  avatar_url: string | null
  bio: string | null
  price_multiplier: number
}

interface StepInfluencerProps {
  influencers: Influencer[]
  selected: string | null
  onSelect: (id: string) => void
}

export default function StepInfluencer({ influencers, selected, onSelect }: StepInfluencerProps) {
  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        اختر المؤثر
      </h2>
      <p className="text-sm text-muted text-center mb-6">
        حدد الحساب الذي تريد النشر من خلاله
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {influencers.map(inf => {
          const total = inf.x_followers + inf.ig_followers + inf.li_followers + inf.tk_followers
          const isSelected = selected === inf.id

          return (
            <button
              key={inf.id}
              onClick={() => onSelect(inf.id)}
              className={cn(
                'p-5 rounded-2xl border-2 text-right transition-all cursor-pointer',
                'hover:shadow-md active:scale-[0.98]',
                isSelected
                  ? 'border-green bg-green/5 shadow-md'
                  : 'border-border bg-card hover:border-green/30'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-green/10 rounded-full flex items-center justify-center text-green text-xl font-black">
                  {inf.name_ar.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-dark">{inf.name_ar}</h3>
                  {inf.name_en && (
                    <p className="text-xs text-muted" dir="ltr">{inf.name_en}</p>
                  )}
                </div>
                {isSelected && (
                  <span className="mr-auto text-green text-xl">✓</span>
                )}
              </div>

              {inf.bio && (
                <p className="text-xs text-muted mb-3 line-clamp-2">{inf.bio}</p>
              )}

              <div className="flex flex-wrap gap-2 text-xs">
                {inf.x_followers > 0 && (
                  <span className="px-2 py-1 bg-dark/5 rounded-lg">𝕏 {formatNumberShort(inf.x_followers)}</span>
                )}
                {inf.ig_followers > 0 && (
                  <span className="px-2 py-1 bg-pink-50 rounded-lg text-pink-600">◉ {formatNumberShort(inf.ig_followers)}</span>
                )}
                {inf.li_followers > 0 && (
                  <span className="px-2 py-1 bg-blue-50 rounded-lg text-blue-600">in {formatNumberShort(inf.li_followers)}</span>
                )}
                {inf.tk_followers > 0 && (
                  <span className="px-2 py-1 bg-teal-50 rounded-lg text-teal-600">▶ {formatNumberShort(inf.tk_followers)}</span>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-border/50 text-center">
                <span className="text-sm font-bold text-green">+{formatNumberShort(total)}</span>
                <span className="text-xs text-muted mr-1">متابع</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
