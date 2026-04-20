'use client'

import { PLATFORMS } from '@/lib/constants'
import { formatNumberShort } from '@/lib/utils'

interface InfluencerReach {
  x_followers: number
  ig_followers: number
  li_followers: number
  tk_followers: number
}

interface ReachBarsProps {
  influencer?: InfluencerReach
  showTotal?: boolean
}

export default function ReachBars({ influencer, showTotal = true }: ReachBarsProps) {
  const followers = influencer
    ? [influencer.x_followers, influencer.ig_followers, influencer.li_followers, influencer.tk_followers]
    : [330000, 145000, 81000, 26000]

  const total = followers.reduce((a, b) => a + b, 0)
  const max = Math.max(...followers)

  return (
    <div className="space-y-3">
      {PLATFORMS.map((platform, i) => (
        <div key={platform.id} className="flex items-center gap-3">
          <span className="w-8 text-center font-bold text-lg" style={{ color: platform.color }}>
            {platform.name}
          </span>
          <div className="flex-1 h-3 bg-border/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${(followers[i] / max) * 100}%`,
                backgroundColor: platform.color,
              }}
            />
          </div>
          <span className="text-sm font-bold text-dark min-w-[50px] text-left" dir="ltr">
            {formatNumberShort(followers[i])}
          </span>
        </div>
      ))}
      {showTotal && (
        <div className="pt-2 border-t border-border/50 text-center">
          <span className="text-lg font-black text-green">+{formatNumberShort(total)}</span>
          <span className="text-sm text-muted mr-2">متابع حقيقي</span>
        </div>
      )}
    </div>
  )
}
