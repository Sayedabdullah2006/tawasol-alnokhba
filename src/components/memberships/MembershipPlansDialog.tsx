'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MEMBERSHIP_PLANS } from '@/lib/memberships'
import { formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'
import MembershipPlanBadge from './MembershipPlanBadge'

export default function MembershipPlansDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [duration, setDuration] = useState<3 | 6 | 12>(3)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-dark/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="membership-dialog-title" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-lg border border-white/70 bg-[#f7f9fd] shadow-2xl sm:max-w-7xl sm:rounded-lg" dir="rtl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-white/90 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div>
            <p className="text-xs font-bold text-gold">خطة حضور تمتد مع إنجازاتك</p>
            <h2 id="membership-dialog-title" className="mt-1 text-xl font-black text-dark sm:text-2xl">اختر العضوية الأنسب لك</h2>
            <p className="mt-1 text-xs text-muted sm:text-sm">رصيد مرن طوال المدة، مزايا محددة، عقد موثق، والطلبات المباشرة تبقى متاحة دائماً.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-white text-xl text-dark" aria-label="إغلاق">×</button>
        </div>

        <div className="p-4 sm:p-7">
          <div className="mx-auto mb-6 grid w-full max-w-md grid-cols-3 rounded-lg border border-border bg-white p-1" aria-label="مدة العضوية">
            {([3, 6, 12] as const).map(months => (
              <button key={months} type="button" onClick={() => setDuration(months)} className={cn('rounded-md px-3 py-2 text-sm font-bold transition', duration === months ? 'bg-green text-white shadow-sm' : 'text-muted hover:bg-cream')}>
                {months === 12 ? 'سنة' : `${months} أشهر`}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MEMBERSHIP_PLANS.map(plan => {
              const price = plan.prices.find(item => item.months === duration)!
              const monthly = Math.round(price.total / duration)
              const platinum = plan.id === 'platinum'
              const corporate = plan.id === 'corporate'
              return (
                <section key={plan.id} className={cn('relative overflow-hidden rounded-lg border p-5', platinum ? 'border-gold/60 bg-dark text-white shadow-xl' : corporate ? 'border-green/50 bg-[#edf8f6] text-dark shadow-lg' : 'border-border bg-white text-dark shadow-sm')}>
                  {platinum && <span className="absolute left-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[10px] font-black text-dark">الأكثر تكاملاً</span>}
                  {corporate && <span className="absolute left-3 top-3 rounded-full bg-green px-2.5 py-1 text-[10px] font-black text-white">للشركات</span>}
                  <div className="flex items-center gap-3 pr-0">
                    <MembershipPlanBadge planId={plan.id} size="lg" />
                    <div className="min-w-0">
                      <p className={cn('max-w-[80%] text-xs font-bold', platinum ? 'text-gold' : 'text-green')}>{plan.tagline}</p>
                      <h3 className="mt-1 text-2xl font-black">{plan.name}</h3>
                    </div>
                  </div>
                  <p className={cn('mt-2 min-h-20 text-sm leading-6', platinum ? 'text-white/70' : 'text-muted')}>{plan.description}</p>
                  <div className="my-5 border-y border-current/10 py-4">
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black">{formatNumber(price.total)}</span>
                      <span className={platinum ? 'text-white/60' : 'text-muted'}>ر.س شامل الضريبة</span>
                    </div>
                    <p className={cn('mt-1 text-xs', platinum ? 'text-white/55' : 'text-muted')}>ما يعادل {formatNumber(monthly)} ر.س شهرياً</p>
                  </div>
                  <div className={cn('mb-4 grid grid-cols-2 gap-2 rounded-md p-3 text-xs', platinum ? 'bg-white/10' : 'bg-cream')}>
                    <div><span className={platinum ? 'text-white/60' : 'text-muted'}>رصيد النشر</span><strong className="mt-1 block text-base">{price.credits}</strong></div>
                    <div><span className={platinum ? 'text-white/60' : 'text-muted'}>اقتباس/إعادة نشر</span><strong className="mt-1 block text-base">{price.benefits.reshare_quote || '—'}</strong></div>
                    <div><span className={platinum ? 'text-white/60' : 'text-muted'}>تثبيت</span><strong className="mt-1 block text-base">{price.benefits.pin || '—'}</strong></div>
                    <div><span className={platinum ? 'text-white/60' : 'text-muted'}>حملات ممولة</span><strong className="mt-1 block text-base">{price.benefits.paid_campaign || '—'}</strong></div>
                  </div>
                  <ul className="space-y-2.5">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2 text-sm"><span className={platinum ? 'text-gold' : 'text-green'}>✓</span><span>{feature}</span></li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => router.push(`/memberships/checkout?plan=${plan.id}&duration=${duration}`)} className={cn('mt-6 w-full rounded-lg px-4 py-3 text-sm font-black transition', platinum ? 'bg-gold text-dark hover:bg-[#d8bd7c]' : 'bg-green text-white hover:bg-light')}>
                    اختر {plan.shortName}
                  </button>
                </section>
              )
            })}
          </div>
          <p className="mt-5 text-center text-xs leading-6 text-muted">الرصيد صالح طوال مدة العضوية وينتهي المتبقي بانتهائها. لا يوجد تجديد تلقائي، ويصلك عقد PDF بعد التفعيل.</p>
        </div>
      </div>
    </div>
  )
}
