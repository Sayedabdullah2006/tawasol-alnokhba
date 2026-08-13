'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getMembershipPlan, getMembershipSavings, MEMBERSHIP_TERMS_TEXT } from '@/lib/memberships'
import { formatNumber } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import MembershipPlanBadge from './MembershipPlanBadge'

export default function MembershipCheckout({ planId, duration }: { planId: string; duration: 3 | 6 | 12 }) {
  const router = useRouter()
  const { showToast } = useToast()
  const plan = getMembershipPlan(planId)
  const price = plan?.prices.find(item => item.months === duration)
  const savings = price ? getMembershipSavings(price) : null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace(`/auth/login?next=${encodeURIComponent(`/memberships/checkout?plan=${planId}&duration=${duration}`)}`)
        return
      }
      setEmail(user.email ?? '')
      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle()
      setName(profile?.full_name ?? '')
      setPhone(profile?.phone ?? '')
      setLoading(false)
    }
    load()
  }, [duration, planId, router])

  if (!plan || !price) return <div className="mx-auto max-w-xl p-8 text-center">الخطة المختارة غير متاحة.</div>

  const submit = async () => {
    if (!name.trim() || !terms || !privacy) {
      showToast('أكمل البيانات ووافق على الشروط وسياسة الخصوصية', 'error')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, durationMonths: duration, clientName: name, clientPhone: phone, acceptedTerms: terms, acceptedPrivacy: privacy }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(data.error ?? 'تعذر إنشاء العضوية', 'error')
        if (data.membershipId) router.push('/dashboard/membership')
        return
      }
      router.push(`/memberships/payment/${data.membership.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="mx-auto max-w-xl p-10 text-center text-muted">جارٍ تجهيز بيانات العضوية...</div>

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12" dir="rtl">
      <Link href="/request" className="mb-5 inline-flex text-sm font-bold text-green hover:underline">→ العودة إلى الطلب المباشر</Link>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7">
          <p className="text-xs font-bold text-gold">خطوة واحدة قبل الدفع</p>
          <h1 className="mt-1 text-2xl font-black text-dark">بيانات وشروط العضوية</h1>
          <p className="mt-2 text-sm text-muted">راجع التفاصيل بهدوء. لن تتجدد العضوية تلقائياً، وسيصلك عقد PDF بعد التفعيل.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-dark">الاسم الكامل<input value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-white px-4 py-3 font-normal outline-none focus:border-green" /></label>
            <label className="text-sm font-bold text-dark">رقم الجوال<input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className="mt-2 w-full rounded-lg border border-border bg-white px-4 py-3 text-left font-normal outline-none focus:border-green" /></label>
            <label className="text-sm font-bold text-dark sm:col-span-2">البريد الإلكتروني<input value={email} disabled dir="ltr" className="mt-2 w-full rounded-lg border border-border bg-cream px-4 py-3 text-left font-normal text-muted" /></label>
          </div>

          <div className="terms-scroll mt-6 max-h-72 overflow-y-auto whitespace-pre-line rounded-lg border border-border bg-white p-5 text-xs leading-7 text-dark">{MEMBERSHIP_TERMS_TEXT}</div>
          <div className="mt-5 space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-white p-4 text-sm"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-[#14366E]" /><span>قرأت شروط العضوية وأوافق عليها، وأفهم أن الرصيد والمزايا صالحة طوال المدة وتنتهي بانتهائها.</span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-white p-4 text-sm"><input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} className="mt-1 h-4 w-4 accent-[#14366E]" /><span>أوافق على معالجة بياناتي لإدارة العضوية والدفع والطلبات وفق <Link href="/policies" target="_blank" className="font-bold text-green underline">سياسة الخصوصية</Link>.</span></label>
          </div>
        </section>

        <aside className="sticky top-24 overflow-hidden rounded-lg border border-gold/40 bg-dark text-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-white/10 p-5"><MembershipPlanBadge planId={plan.id} size="lg" /><div><p className="text-xs font-bold text-gold">ملخص الاختيار</p><h2 className="mt-1 text-xl font-black">{plan.name}</h2><p className="mt-1 text-xs text-white/60">{duration === 12 ? 'سنة كاملة' : `${duration} أشهر`}</p></div></div>
          <div className="p-5">
            <ul className="space-y-2 text-sm">{plan.features.map(item => <li key={item} className="flex gap-2"><span className="text-gold">✓</span><span>{item}</span></li>)}</ul>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-white/10 p-3 text-xs"><div><span className="text-white/60">رصيد النشر</span><strong className="mt-1 block text-lg">{price.credits}</strong></div><div><span className="text-white/60">اقتباس/إعادة نشر</span><strong className="mt-1 block text-lg">{price.benefits.reshare_quote || '—'}</strong></div><div><span className="text-white/60">تثبيت</span><strong className="mt-1 block text-lg">{price.benefits.pin || '—'}</strong></div><div><span className="text-white/60">حملات ممولة</span><strong className="mt-1 block text-lg">{price.benefits.paid_campaign || '—'}</strong></div></div>
            <div className="my-5 border-y border-white/10 py-4"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="rounded-full bg-gold px-2.5 py-1 font-black text-dark">وفّر حتى {savings?.savingPercent ?? 0}%</span><span className="text-white/55">بدلاً من <del>{formatNumber(savings?.regularValue ?? price.total)} ر.س</del></span></div><p className="text-xs text-white/60">إجمالي العضوية</p><p className="mt-1 text-3xl font-black text-gold">{formatNumber(price.total)} ر.س</p><p className="mt-1 text-xs font-bold text-gold">توفر {formatNumber(savings?.savingAmount ?? 0)} ر.س عند استخدام كامل الرصيد والمزايا</p></div>
            <Button onClick={submit} loading={submitting} disabled={submitting || !terms || !privacy || !name.trim()} className="w-full !bg-gold !text-dark hover:!bg-[#d8bd7c]">المتابعة إلى الدفع</Button>
            <p className="mt-3 text-center text-[10px] leading-5 text-white/50">إنشاء العضوية لا يخصم أي مبلغ حتى تختار وسيلة الدفع وتكملها.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
