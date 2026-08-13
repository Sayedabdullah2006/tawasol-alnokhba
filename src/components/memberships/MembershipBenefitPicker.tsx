'use client'

import { cn } from '@/lib/utils'
import {
  membershipBenefitLabel,
  type MembershipBenefitSelection,
  type MembershipBenefitType,
} from '@/lib/memberships'

type BenefitWallet = {
  id: string
  benefit_type: MembershipBenefitType
  total_units: number
  reserved_units: number
  used_units: number
  unit_budget?: number
}

type Props = {
  wallets: BenefitWallet[]
  value: MembershipBenefitSelection[]
  onChange: (value: MembershipBenefitSelection[]) => void
}

function defaultSelection(type: MembershipBenefitType): MembershipBenefitSelection {
  if (type === 'reshare_quote') {
    return { type, settings: { action: 'reshare', delay_days: 1 } }
  }
  if (type === 'pin') return { type, settings: { duration_hours: 6 } }
  return { type, settings: {} }
}

export default function MembershipBenefitPicker({ wallets, value, onChange }: Props) {
  const selected = (type: MembershipBenefitType) => value.find(item => item.type === type)
  const toggle = (type: MembershipBenefitType, available: number) => {
    if (available <= 0) return
    onChange(selected(type) ? value.filter(item => item.type !== type) : [...value, defaultSelection(type)])
  }
  const update = (type: MembershipBenefitType, settings: MembershipBenefitSelection['settings']) => {
    onChange(value.map(item => item.type === type ? { ...item, settings: { ...item.settings, ...settings } } : item))
  }

  return (
    <section className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-dark">تعزيز المنشور من مزايا عضويتك</h3>
          <p className="mt-1 text-xs text-muted">اختياري. تُحجز وحدة واحدة من كل ميزة تختارها عند إرسال الطلب.</p>
        </div>
        <span className="text-[11px] font-bold text-green">يمكن اختيار أكثر من ميزة</span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {wallets.map(wallet => {
          const current = selected(wallet.benefit_type)
          const available = wallet.total_units - wallet.reserved_units - wallet.used_units
          const exhausted = available <= 0
          return (
            <article key={wallet.id} className={cn('rounded-lg border p-4 transition', current ? 'border-green bg-green/5' : 'border-border bg-white', exhausted && 'opacity-60')}>
              <label className={cn('flex items-start gap-3', exhausted ? 'cursor-not-allowed' : 'cursor-pointer')}>
                <input
                  type="checkbox"
                  checked={!!current}
                  disabled={exhausted}
                  onChange={() => toggle(wallet.benefit_type, available)}
                  className="mt-1 h-4 w-4 accent-green"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-dark">{membershipBenefitLabel(wallet.benefit_type)}</span>
                  <span className="mt-1 block text-[11px] text-muted">
                    {exhausted ? 'نفد الرصيد' : <>المتاح {available} {current && <strong className="text-green">· بعد الحجز {available - 1}</strong>}</>}
                  </span>
                </span>
              </label>

              {current?.type === 'reshare_quote' && (
                <div className="mt-4 space-y-3 border-t border-green/15 pt-3">
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold text-dark">نوع التعزيز</p>
                    <div className="grid grid-cols-2 rounded-lg border border-border bg-cream p-1">
                      {([['reshare', 'إعادة نشر'], ['quote', 'اقتباس']] as const).map(([action, label]) => (
                        <button key={action} type="button" onClick={() => update('reshare_quote', { action })} className={cn('rounded-md px-2 py-2 text-xs font-bold transition', current.settings.action === action ? 'bg-white text-green shadow-sm' : 'text-muted')}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold text-dark">موعد التنفيذ بعد النشر</p>
                    <div className="grid grid-cols-2 rounded-lg border border-border bg-cream p-1">
                      {([[1, 'بعد يوم'], [2, 'بعد يومين']] as const).map(([days, label]) => (
                        <button key={days} type="button" onClick={() => update('reshare_quote', { delay_days: days })} className={cn('rounded-md px-2 py-2 text-xs font-bold transition', current.settings.delay_days === days ? 'bg-white text-green shadow-sm' : 'text-muted')}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {current?.type === 'pin' && (
                <p className="mt-4 rounded-lg bg-cream p-3 text-xs font-bold text-dark">يُثبت المنشور لمدة 6 ساعات بعد نشره.</p>
              )}

              {current?.type === 'paid_campaign' && (
                <p className="mt-4 rounded-lg bg-cream p-3 text-xs leading-5 text-dark">تنسق الإدارة موعد الحملة والجمهور{wallet.unit_budget ? ` بميزانية تصل إلى ${wallet.unit_budget} ر.س` : ''}.</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
