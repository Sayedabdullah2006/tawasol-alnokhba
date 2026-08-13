'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { calculateMembershipTopup, MEMBERSHIP_TOPUP_CATALOG, type MembershipTopupItemType } from '@/lib/membership-topups'
import { formatNumber } from '@/lib/utils'

type Props = {
  membership: { id: string; ends_at: string }
  balances: Record<MembershipTopupItemType, number>
}

export default function MembershipTopupShop({ membership, balances }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [itemType, setItemType] = useState<MembershipTopupItemType>('publication_credit')
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const pricing = useMemo(() => calculateMembershipTopup(itemType, quantity)!, [itemType, quantity])

  const selectItem = (type: MembershipTopupItemType) => {
    setItemType(type)
    setQuantity(1)
  }

  const proceed = async () => {
    setSubmitting(true)
    const response = await fetch('/api/memberships/topups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: membership.id, itemType, quantity }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.topup?.id) router.push(`/memberships/topup/payment/${data.topup.id}`)
    else {
      showToast(data.error ?? 'تعذر إنشاء عملية تعزيز الرصيد', 'error')
      setSubmitting(false)
    }
  }

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" dir="rtl">
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-5"><p className="text-xs font-bold text-gold">خيارات مرنة لعضويتك</p><h1 className="mt-1 text-2xl font-black text-dark">تعزيز رصيد العضوية</h1><p className="mt-1 text-sm text-muted">اختر الرصيد أو الميزة المطلوبة، وحدد الكمية، ثم راجع السعر قبل الدفع.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MEMBERSHIP_TOPUP_CATALOG.map(item => {
          const selected = itemType === item.type
          return <button key={item.type} type="button" onClick={() => selectItem(item.type)} className={`min-h-36 rounded-lg border p-4 text-right transition ${selected ? 'border-green bg-green/5 shadow-sm' : 'border-border bg-white hover:border-green/40'}`}>
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-dark">{item.label}</h2><p className="mt-2 text-xs leading-5 text-muted">{item.description}</p></div><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${selected ? 'border-green bg-green text-white' : 'border-border text-transparent'}`}>✓</span></div>
            <div className="mt-3 flex items-end justify-between border-t border-border/70 pt-3"><span className="text-[11px] text-muted">رصيدك الحالي: <strong className="text-dark">{balances[item.type] ?? 0}</strong></span><span className="font-black text-green">{formatNumber(item.unitPrice)} ر.س <small className="font-normal text-muted">/ للوحدة</small></span></div>
          </button>
        })}
      </div>

      <div className="mt-5 rounded-lg border border-border bg-cream/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black text-dark">الكمية</p><p className="text-xs text-muted">الحد الأقصى لهذه العملية {pricing.item.maxQuantity}</p></div><div className="flex h-11 items-center rounded-lg border border-border bg-white"><button type="button" aria-label="تقليل الكمية" onClick={() => setQuantity(value => Math.max(1, value - 1))} disabled={quantity <= 1} className="h-full w-11 text-xl text-dark disabled:opacity-30">−</button><input aria-label="الكمية" type="number" min="1" max={pricing.item.maxQuantity} value={quantity} onChange={event => setQuantity(Math.min(pricing.item.maxQuantity, Math.max(1, Number(event.target.value) || 1)))} className="h-full w-16 border-x border-border bg-transparent text-center font-black text-dark outline-none"/><button type="button" aria-label="زيادة الكمية" onClick={() => setQuantity(value => Math.min(pricing.item.maxQuantity, value + 1))} disabled={quantity >= pricing.item.maxQuantity} className="h-full w-11 text-xl text-dark disabled:opacity-30">＋</button></div></div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-white p-3"><span className="text-sm text-muted">الرصيد بعد اكتمال الدفع</span><strong className="text-lg text-green">{(balances[itemType] ?? 0) + quantity}</strong></div>
      </div>
    </section>

    <aside className="h-fit rounded-lg border border-gold/30 bg-dark p-5 text-white shadow-lg lg:sticky lg:top-24">
      <p className="text-xs font-bold text-gold">ملخص العملية</p><h2 className="mt-1 text-xl font-black">{pricing.item.label}</h2><div className="mt-5 space-y-3 border-y border-white/10 py-4 text-sm"><div className="flex justify-between"><span className="text-white/60">الكمية</span><strong>{quantity}</strong></div><div className="flex justify-between"><span className="text-white/60">سعر الوحدة</span><strong>{formatNumber(pricing.item.unitPrice)} ر.س</strong></div></div><div className="my-5 flex items-end justify-between"><span className="text-sm text-white/70">الإجمالي</span><strong className="text-2xl text-gold">{formatNumber(pricing.total)} ر.س</strong></div><Button onClick={proceed} loading={submitting} className="w-full !bg-gold !text-dark">متابعة إلى الدفع</Button><p className="mt-3 text-[11px] leading-5 text-white/55">تضاف الوحدات تلقائياً بعد تأكيد الدفع، وتبقى صالحة حتى {new Date(membership.ends_at).toLocaleDateString('ar-SA')}.</p>
    </aside>
  </div>
}
