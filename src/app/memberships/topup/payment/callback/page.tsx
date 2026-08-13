'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function Callback() {
  const params = useSearchParams()
  const router = useRouter()
  const paymentId = params.get('id')
  const topupId = params.get('topupId')
  const [state, setState] = useState<'loading' | 'success' | 'pending' | 'failed'>(paymentId ? 'loading' : 'failed')
  const [error, setError] = useState(paymentId ? '' : 'معرف الدفعة غير موجود')
  useEffect(() => {
    if (!paymentId || !topupId) return
    fetch(`/api/memberships/topups/payment/verify?id=${encodeURIComponent(paymentId)}&topupId=${encodeURIComponent(topupId)}`)
      .then(response => response.json()).then(data => {
        if (data.success && ['verified_and_applied', 'already_processed'].includes(data.reason)) setState('success')
        else if (data.reason === 'payment_not_paid') setState('pending')
        else { setError(data.error ?? data.reason ?? 'تعذر إضافة الرصيد'); setState('failed') }
      }).catch(() => { setError('تعذر الاتصال بالخادم'); setState('failed') })
  }, [paymentId, topupId])
  return <div className="mx-auto max-w-xl px-4 py-12" dir="rtl"><div className="rounded-lg border border-border bg-card p-8 text-center shadow-lg">{state === 'loading' && <><LoadingSpinner size="lg"/><p className="mt-4 text-muted">جارٍ التحقق من الدفعة وإضافة الرصيد...</p></>}{state === 'success' && <><div className="text-5xl text-green">✓</div><h1 className="mt-3 text-2xl font-black text-dark">تم تعزيز رصيدك</h1><p className="mt-2 text-sm text-muted">أضيفت الوحدات إلى عضويتك وأصبحت متاحة للاستخدام.</p></>}{state === 'pending' && <><div className="text-4xl">⌛</div><h1 className="mt-3 text-2xl font-black text-dark">الدفعة قيد المعالجة</h1><p className="mt-2 text-sm text-muted">سيضاف الرصيد تلقائياً بعد تأكيد مزود الدفع.</p></>}{state === 'failed' && <><div className="text-5xl text-red-600">×</div><h1 className="mt-3 text-2xl font-black text-dark">تعذر إضافة الرصيد</h1><p className="mt-2 text-sm text-red-600">{error}</p></>}<Button onClick={() => router.push('/dashboard/membership')} className="mt-6 w-full">عرض عضويتي</Button></div></div>
}
export default function MembershipTopupCallbackPage() { return <Suspense fallback={<div className="p-12"><LoadingSpinner size="lg"/></div>}><Callback/></Suspense> }
