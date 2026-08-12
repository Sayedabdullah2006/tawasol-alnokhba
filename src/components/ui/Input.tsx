'use client'

import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-dark">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-lg border border-white/65 bg-white/50 px-4 py-3 text-dark placeholder:text-muted/60 backdrop-blur-sm',
            'focus:border-green focus:outline-none focus:ring-2 focus:ring-green/20',
            'transition-all duration-200 min-h-[48px] text-[14px]',
            error ? 'border-red-400' : 'border-border',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
