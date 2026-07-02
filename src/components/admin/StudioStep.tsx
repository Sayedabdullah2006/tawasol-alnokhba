'use client'

/**
 * ترويسة خطوة موحّدة للاستوديو (الطلبات والمستقل): شارة رقم دائرية + عنوان + وصف
 * + مؤشّر إتمام. تمنح الاستوديو مظهراً متدرّجاً أنيقاً ومتّسقاً دون تغيير المنطق.
 */
export function StepHead({
  n,
  title,
  subtitle,
  done,
  tone = 'green',
}: {
  n: number | string
  title: string
  subtitle?: string
  done?: boolean
  tone?: 'green' | 'gold'
}) {
  const ring = tone === 'gold' ? 'bg-amber-400/15 text-amber-600 border-amber-400/40' : 'bg-green/10 text-green border-green/30'
  return (
    <div className="flex items-start gap-3">
      <span
        className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-sm font-black transition-colors ${
          done ? 'bg-green text-white border-green' : ring
        }`}
      >
        {done ? '✓' : n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="font-black text-dark leading-tight">{title}</h4>
        {subtitle && <p className="text-[11px] text-muted mt-0.5 leading-snug">{subtitle}</p>}
      </div>
    </div>
  )
}
