'use client'

import { POST_COUNT_MESSAGES, POST_COUNT_MESSAGE_11_PLUS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Step5Props {
  count: number
  onChange: (n: number) => void
}

const SHORTCUTS = [1, 2, 3, 5, 10]

export default function Step5Posts({ count, onChange }: Step5Props) {
  const message = count >= 11
    ? POST_COUNT_MESSAGE_11_PLUS
    : POST_COUNT_MESSAGES[count] ?? POST_COUNT_MESSAGES[1]

  const progressPct = Math.min((count / 11) * 100, 100)

  return (
    <div className="wizard-enter">
      <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
        كم منشوراً تريد؟
      </h2>
      <p className="text-sm text-muted text-center mb-8">
        كلما زاد العدد، زاد الخصم على إجمالي طلبك
      </p>

      <div className="max-w-sm mx-auto">
        {/* Counter */}
        <div className="flex items-center justify-center gap-6 mb-6">
          <button
            onClick={() => onChange(Math.max(1, count - 1))}
            className="w-14 h-14 rounded-full border-2 border-border bg-card text-2xl font-bold text-dark
                       hover:border-green hover:text-green transition-all cursor-pointer
                       disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={count <= 1}
          >
            −
          </button>
          <span className="text-6xl font-black text-dark min-w-[80px] text-center">{count}</span>
          <button
            onClick={() => onChange(count + 1)}
            className="w-14 h-14 rounded-full border-2 border-green bg-green/5 text-2xl font-bold text-green
                       hover:bg-green hover:text-white transition-all cursor-pointer"
          >
            +
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-border/30 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPct}%`,
              background: progressPct >= 90 ? 'var(--gold)' : 'var(--green)',
            }}
          />
        </div>

        {/* Message */}
        <p className="text-center text-sm font-medium text-green mb-6">{message}</p>

        {/* Shortcuts */}
        <div className="flex justify-center gap-2 flex-wrap">
          {SHORTCUTS.map(n => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer min-h-[44px]',
                count === n
                  ? 'bg-green text-white'
                  : 'bg-card border border-border text-dark hover:border-green'
              )}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => onChange(count + 10)}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-card border border-border text-dark
                       hover:border-green transition-all cursor-pointer min-h-[44px]"
          >
            +10
          </button>
        </div>
      </div>
    </div>
  )
}
