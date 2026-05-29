'use client'

interface WizardProgressProps {
  current: number
  total: number
}

export default function WizardProgress({ current, total }: WizardProgressProps) {
  const pct = (current / total) * 100
  const remaining = total - current

  const encouragement =
    remaining === 1 ? '🎉 بقيت خطوة أخيرة فقط!' :
    remaining === 2 ? '💪 بقيت خطوتان فقط' :
    null

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-dark">خطوة {current} من {total}</span>
        <span className="text-sm text-muted">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 bg-border/30 rounded-full overflow-hidden">
        <div
          className="h-full bg-green rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {encouragement && (
        <p className="text-xs font-bold text-green text-center mt-2 wizard-enter">
          {encouragement}
        </p>
      )}
    </div>
  )
}
