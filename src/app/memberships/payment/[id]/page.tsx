'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PaymentForm from '@/components/payment/PaymentForm'
import ReceiptUploader from '@/components/request/ReceiptUploader'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { formatMembershipNumber } from '@/lib/memberships'
import { formatNumber } from '@/lib/utils'

const BANK_INFO = {
  bankName: 'بنك إس تي سي (stc pay)',
  accountName: 'شركة تواصل النخبة للدعاية والإعلان',
  iban: 'SA4678000000001258622215',
}

type PaymentMethod = 'online' | 'tamara' | 'bank'

type MembershipPaymentDetails = {
  id: string
  status: string
  membership_number: number | string
  duration_months: number
  total_amount: number | string
  receipt_url?: string | null
  membership_plans?: { name_ar?: string | null } | null
  membership_plan_prices?: { included_credits?: number | null } | null
}

export default function MembershipPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { showToast } = useToast()
  const [membership, setMembership] = useState<MembershipPaymentDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState<PaymentMethod>('online')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/memberships/${id}`).then(async response => {
      if (response.status === 401) { router.replace(`/auth/login?next=${encodeURIComponent(`/memberships/payment/${id}`)}`); return }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { router.replace('/dashboard/membership'); return }
      if (data.membership.status !== 'pending_payment') { router.replace('/dashboard/membership'); return }
      setMembership(data.membership)
      setReceiptUrl(data.membership.receipt_url ?? null)
      setLoading(false)
    })
  }, [id, router])

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    showToast('تم النسخ')
  }

  const submitBankTransfer = async () => {
    if (!receiptUrl) return
    setSubmitting(true)
    const response = await fetch('/api/memberships/payment/bank-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: id, receiptUrl }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok) {
      showToast('تم إرسال الإيصال للتحقق')
      router.replace('/dashboard/membership')
    } else showToast(data.error ?? 'تعذر إرسال الإيصال', 'error')
    setSubmitting(false)
  }

  const startTamara = async () => {
    setSubmitting(true)
    const response = await fetch('/api/memberships/payment/tamara/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: id }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.checkoutUrl) window.location.href = data.checkoutUrl
    else {
      showToast(data.error ?? 'تعذر فتح تمارا لهذه العضوية', 'error')
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-12"><LoadingSpinner size="lg" /></div>
  if (!membership) return null

  const number = formatMembershipNumber(membership.membership_number)
  const amount = Number(membership.total_amount)
  return <div className="mx-auto w-full max-w-4xl px-4 py-8" dir="rtl">
    <Link href="/dashboard/membership" className="mb-4 inline-block text-sm font-bold text-green hover:underline">العودة إلى عضويتي</Link>
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <div className="border-b border-border p-5"><p className="text-xs font-bold text-gold">إتمام الاشتراك</p><h1 className="mt-1 text-2xl font-black text-dark">دفع {membership.membership_plans?.name_ar}</h1><p className="mt-1 text-sm text-muted">{number} · {membership.duration_months} أشهر</p></div>
      <div className="p-5">
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg bg-cream p-4 text-sm"><div><p className="text-muted">رصيد النشر طوال المدة</p><p className="font-black text-dark">{membership.membership_plan_prices?.included_credits} رصيد</p></div><div><p className="text-muted">إجمالي العضوية</p><p className="font-black text-gold">{formatNumber(amount)} ر.س</p></div></div>
        <div className="mb-5 grid grid-cols-3 gap-2" role="tablist" aria-label="طريقة الدفع">
          <button type="button" onClick={() => setMethod('online')} className={`min-h-16 rounded-lg border p-3 text-sm font-bold ${method === 'online' ? 'border-green bg-green/5 text-green' : 'border-border text-dark'}`}>بطاقة ومدى</button>
          <button type="button" onClick={() => setMethod('tamara')} className={`min-h-16 rounded-lg border p-3 text-sm font-bold ${method === 'tamara' ? 'border-[#3D1152] bg-[#3D1152]/5 text-[#3D1152]' : 'border-border text-dark'}`}>تمارا</button>
          <button type="button" onClick={() => setMethod('bank')} className={`min-h-16 rounded-lg border p-3 text-sm font-bold ${method === 'bank' ? 'border-green bg-green/5 text-green' : 'border-border text-dark'}`}>تحويل بنكي</button>
        </div>

        <div className={method === 'online' ? '' : 'hidden'}><PaymentForm amount={amount} description={`اشتراك ${membership.membership_plans?.name_ar} - ${number}`} metadata={{ resource_type: 'membership', membership_id: membership.id, membership_number: number, page_source: 'membership_payment' }} /></div>

        {method === 'tamara' && <div className="space-y-4 rounded-lg border border-[#3D1152]/20 bg-[#3D1152]/5 p-5 text-center"><h2 className="text-lg font-black text-[#3D1152]">الدفع المرن عبر تمارا</h2><p className="text-sm text-muted">يحدد تمارا أهلية التقسيط وعدد الدفعات عند الانتقال. قد لا تتوفر بعض الخطط ذات القيمة المرتفعة بحسب حد العميل.</p><Button onClick={startTamara} loading={submitting} className="w-full">الانتقال إلى تمارا</Button></div>}

        {method === 'bank' && <div className="space-y-4 rounded-lg border border-border p-5"><div><h2 className="font-black text-dark">تفاصيل التحويل</h2><p className="text-xs text-muted">حوّل المبلغ ثم ارفع الإيصال. تتفعّل العضوية بعد تحقق الإدارة.</p></div><div className="grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-lg bg-cream p-3"><p className="text-xs text-muted">البنك</p><p className="font-bold text-dark">{BANK_INFO.bankName}</p></div><div className="rounded-lg bg-cream p-3"><p className="text-xs text-muted">المستفيد</p><p className="font-bold text-dark">{BANK_INFO.accountName}</p></div><div className="rounded-lg bg-cream p-3 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted">الآيبان</p><p className="font-mono text-sm text-dark" dir="ltr">{BANK_INFO.iban}</p></div><button type="button" onClick={() => copy(BANK_INFO.iban.replace(/\s/g, ''))} className="text-xs font-bold text-green">نسخ</button></div></div></div><ReceiptUploader receiptUrl={receiptUrl} onUploaded={setReceiptUrl} /><Button onClick={submitBankTransfer} loading={submitting} disabled={!receiptUrl} className="w-full">إرسال الإيصال للتحقق</Button></div>}
      </div>
    </section>
  </div>
}
