'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function MembershipPaymentCallbackContent() {
  const params = useSearchParams()
  const router = useRouter()
  const paymentId = params.get('id')
  const membershipId = params.get('membershipId')
  const [state, setState] = useState<'loading' | 'success' | 'pending' | 'failed'>(paymentId ? 'loading' : 'failed')
  const [error, setError] = useState(paymentId ? '' : 'معرف الدفعة غير موجود')

  useEffect(() => {
    if (!paymentId) return
    fetch(`/api/memberships/payment/verify?id=${encodeURIComponent(paymentId)}&membershipId=${encodeURIComponent(membershipId ?? '')}`)
      .then(response => response.json())
      .then(data => {
        if (data.success && ['verified_and_activated', 'already_processed'].includes(data.reason)) setState('success')
        else if (data.reason === 'payment_not_paid') setState('pending')
        else { setError(data.error ?? data.reason ?? 'تعذر تفعيل العضوية'); setState('failed') }
      })
      .catch(() => { setError('تعذر الاتصال بالخادم'); setState('failed') })
  }, [membershipId, paymentId])

  return <div className="mx-auto w-full max-w-xl px-4 py-12" dir="rtl"><div className="rounded-lg border border-border bg-card p-7 text-center shadow-sm">
    {state === 'loading' && <><LoadingSpinner size="lg" /><p className="mt-4 text-muted">جارٍ التحقق من الدفعة وتفعيل عضويتك...</p></>}
    {state === 'success' && <><div className="text-5xl">✓</div><h1 className="mt-3 text-2xl font-black text-dark">تم تفعيل عضويتك</h1><p className="mt-2 text-sm leading-7 text-muted">رصيدك جاهز الآن، ويجري تجهيز عقد PDF وإرساله إلى بريدك وحفظه في حسابك.</p><Button onClick={() => router.push('/dashboard/membership')} className="mt-6 w-full">فتح عضويتي</Button></>}
    {state === 'pending' && <><div className="text-5xl">⌛</div><h1 className="mt-3 text-2xl font-black text-dark">الدفعة قيد المعالجة</h1><p className="mt-2 text-sm text-muted">سنحدّث العضوية تلقائياً عند وصول تأكيد مزود الدفع.</p><Button onClick={() => router.push('/dashboard/membership')} className="mt-6 w-full">متابعة الحالة</Button></>}
    {state === 'failed' && <><div className="text-5xl text-red-600">×</div><h1 className="mt-3 text-2xl font-black text-dark">تعذر تفعيل العضوية</h1><p className="mt-2 text-sm text-red-600">{error}</p><Button onClick={() => router.back()} className="mt-6 w-full">إعادة المحاولة</Button></>}
  </div></div>
}

export default function MembershipPaymentCallbackPage() {
  return <Suspense fallback={<div className="p-12"><LoadingSpinner size="lg" /></div>}><MembershipPaymentCallbackContent /></Suspense>
}
