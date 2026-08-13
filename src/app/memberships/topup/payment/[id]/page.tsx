'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PaymentForm from '@/components/payment/PaymentForm'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { formatMembershipTopupNumber, getMembershipTopupItem } from '@/lib/membership-topups'
import { formatNumber } from '@/lib/utils'

type Method = 'online' | 'tamara'

export default function MembershipTopupPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { showToast } = useToast()
  const [topup, setTopup] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState<Method>('online')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/memberships/topups/${id}`).then(async response => {
      if (response.status === 401) { router.replace(`/auth/login?next=${encodeURIComponent(`/memberships/topup/payment/${id}`)}`); return }
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.topup?.status !== 'pending_payment') { router.replace('/dashboard/membership'); return }
      setTopup(data.topup); setLoading(false)
    })
  }, [id, router])

  const metadata = useMemo(() => topup ? { resource_type: 'membership_topup', topup_id: topup.id, membership_id: topup.membership_id, page_source: 'membership_topup' } : undefined, [topup])
  const startTamara = async () => {
    setSubmitting(true)
    const response = await fetch('/api/memberships/topups/payment/tamara/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topupId: id }) })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.checkoutUrl) window.location.href = data.checkoutUrl
    else { showToast(data.error ?? 'تعذر فتح تمارا', 'error'); setSubmitting(false) }
  }
  if (loading) return <div className="p-12"><LoadingSpinner size="lg" /></div>
  if (!topup) return null

  const item = getMembershipTopupItem(topup.item_type)
  const number = formatMembershipTopupNumber(topup.topup_number)
  return <div className="mx-auto w-full max-w-3xl px-4 py-8" dir="rtl">
    <Link href="/dashboard/membership/topup" className="mb-4 inline-block text-sm font-bold text-green hover:underline">العودة إلى تعزيز الرصيد</Link>
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <div className="border-b border-border p-5"><p className="text-xs font-bold text-gold">إتمام عملية التعزيز</p><h1 className="mt-1 text-2xl font-black text-dark">دفع {item?.label}</h1><p className="mt-1 text-sm text-muted">{number} · الكمية {topup.quantity}</p></div>
      <div className="p-5"><div className="mb-5 grid gap-3 rounded-lg bg-cream p-4 text-sm sm:grid-cols-3"><div><p className="text-muted">الميزة</p><p className="font-black text-dark">{item?.shortLabel}</p></div><div><p className="text-muted">الكمية</p><p className="font-black text-dark">{topup.quantity}</p></div><div><p className="text-muted">الإجمالي</p><p className="font-black text-gold">{formatNumber(Number(topup.total_amount))} ر.س</p></div></div>
        <div className="mb-5 grid grid-cols-2 gap-2" role="tablist" aria-label="طريقة الدفع"><button type="button" onClick={() => setMethod('online')} className={`min-h-16 rounded-lg border p-3 text-sm font-bold ${method === 'online' ? 'border-green bg-green/5 text-green' : 'border-border text-dark'}`}>بطاقة ومدى</button><button type="button" onClick={() => setMethod('tamara')} className={`min-h-16 rounded-lg border p-3 text-sm font-bold ${method === 'tamara' ? 'border-[#3D1152] bg-[#3D1152]/5 text-[#3D1152]' : 'border-border text-dark'}`}>تمارا</button></div>
        <div className={method === 'online' ? '' : 'hidden'}><PaymentForm amount={Number(topup.total_amount)} description={`تعزيز رصيد العضوية - ${item?.label} - ${number}`} metadata={metadata} /></div>
        {method === 'tamara' && <div className="space-y-4 rounded-lg border border-[#3D1152]/20 bg-[#3D1152]/5 p-5 text-center"><h2 className="text-lg font-black text-[#3D1152]">الدفع المرن عبر تمارا</h2><p className="text-sm text-muted">تحدد تمارا الأهلية وخطة الدفعات عند الانتقال.</p><Button onClick={startTamara} loading={submitting} className="w-full">الانتقال إلى تمارا</Button></div>}
      </div>
    </section>
  </div>
}
