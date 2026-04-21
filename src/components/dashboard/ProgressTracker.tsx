'use client'

import { cn } from '@/lib/utils'
import { PROGRESS_STEPS, getCurrentStepIndex, isStepCompleted, isStepActive } from '@/lib/constants'
import type { RequestStatus } from '@/lib/constants'

interface ProgressTrackerProps {
  status: RequestStatus
  className?: string
}

export default function ProgressTracker({ status, className }: ProgressTrackerProps) {
  const currentIndex = getCurrentStepIndex(status)
  const isRejected = status === 'rejected'

  if (isRejected) {
    return (
      <div className={cn('bg-red-50 border border-red-200 rounded-xl p-4', className)}>
        <div className="flex items-center gap-3">
          <div className="text-2xl">❌</div>
          <div>
            <h3 className="font-bold text-red-700">تم رفض الطلب</h3>
            <p className="text-sm text-red-600">راجع تفاصيل الطلب للاطلاع على سبب الرفض</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-card rounded-xl border border-border p-5', className)}>
      <h3 className="font-bold text-dark mb-4">مراحل إنجاز الطلب</h3>

      <div className="space-y-4">
        {PROGRESS_STEPS.map((step, index) => {
          const completed = isStepCompleted(index, status)
          const active = isStepActive(index, status)
          const future = currentIndex < index

          return (
            <div key={step.id} className="relative">
              <div className={cn(
                'flex items-start gap-4 p-3 rounded-lg transition-all',
                completed && 'bg-green/5',
                active && 'bg-blue/5 border border-blue/20',
                future && 'opacity-50'
              )}>
                {/* Icon */}
                <div className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm',
                  completed && 'bg-green text-white',
                  active && 'bg-blue text-white',
                  future && 'bg-muted text-muted-foreground'
                )}>
                  {completed ? '✓' : active ? step.icon : step.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={cn(
                      'font-medium text-sm',
                      completed && 'text-green',
                      active && 'text-blue font-bold',
                      future && 'text-muted'
                    )}>
                      {step.label}
                    </h4>
                    {completed && (
                      <span className="text-xs text-green">مكتمل</span>
                    )}
                    {active && (
                      <span className="text-xs text-blue">جاري العمل</span>
                    )}
                  </div>
                  <p className={cn(
                    'text-xs',
                    completed && 'text-green/70',
                    active && 'text-blue/70',
                    future && 'text-muted'
                  )}>
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              {index < PROGRESS_STEPS.length - 1 && (
                <div className={cn(
                  'w-0.5 h-6 mr-7 mt-1',
                  completed ? 'bg-green/30' : 'bg-border'
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Status message */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted text-center">
          {currentIndex < PROGRESS_STEPS.length && currentIndex >= 0 && (
            <>جاري العمل على: {PROGRESS_STEPS[currentIndex]?.label}</>
          )}
          {status === 'completed' && (
            <>تم إنجاز الطلب بنجاح! 🎉</>
          )}
        </p>
      </div>
    </div>
  )
}