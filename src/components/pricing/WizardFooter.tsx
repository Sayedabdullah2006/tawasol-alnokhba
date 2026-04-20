'use client'

import Button from '@/components/ui/Button'

interface WizardFooterProps {
  onNext: () => void
  onBack?: () => void
  onSkip?: () => void
  nextDisabled?: boolean
  nextLabel?: string
  showBack?: boolean
  showSkip?: boolean
}

export default function WizardFooter({
  onNext,
  onBack,
  onSkip,
  nextDisabled = false,
  nextLabel = 'التالي ←',
  showBack = true,
  showSkip = false,
}: WizardFooterProps) {
  return (
    <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
      {showBack && onBack && (
        <Button variant="ghost" onClick={onBack} className="min-w-[80px]">
          → رجوع
        </Button>
      )}
      <div className="flex-1" />
      {showSkip && onSkip && (
        <Button variant="outline" onClick={onSkip} className="min-w-[120px]">
          تخطي هذه الخطوة
        </Button>
      )}
      <Button onClick={onNext} disabled={nextDisabled} className="min-w-[120px]">
        {nextLabel}
      </Button>
    </div>
  )
}
