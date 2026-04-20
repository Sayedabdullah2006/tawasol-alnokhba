'use client'

import { cn } from '@/lib/utils'
import { type TextareaHTMLAttributes, forwardRef } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  showCount?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, showCount, maxLength, value, className, id, ...props }, ref) => {
    const charCount = typeof value === 'string' ? value.length : 0

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-dark">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          value={value}
          maxLength={maxLength}
          className={cn(
            'w-full px-4 py-3 rounded-xl border bg-card text-dark placeholder:text-muted/60',
            'focus:outline-none focus:ring-2 focus:ring-green/30 focus:border-green',
            'transition-all duration-200 min-h-[120px] text-[14px] resize-y',
            error ? 'border-red-400' : 'border-border',
            className
          )}
          {...props}
        />
        <div className="flex justify-between">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {showCount && maxLength && (
            <p className="text-xs text-muted mr-auto">{charCount}/{maxLength}</p>
          )}
        </div>
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
export default Textarea
