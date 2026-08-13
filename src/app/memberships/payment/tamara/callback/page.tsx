'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function CallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const status = searchParams.get('status')
  const membershipId = searchParams.get('membershipId')
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (status !== 'approved' || !membershipId) return
    let attempts = 0
    const timer = window.setInterval(async () => {
      attempts += 1
      const response = await fetch(`/api/memberships/${membershipId}`)
      const data = await response.json().catch(() => ({}))
      if (data.membership?.status === 'active') {
        setActive(true)
        window.clearInterval(timer)
      } else if (attempts >= 6) window.clearInterval(timer)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [membershipId, status])

  const title = status === 'cancelled' ? 'تم إلغاء الدفع' : status === 'failed' ? 'تعذر إتمام الدفع' : active ? 'تم تفعيل عضويتك' : 'يجري تأكيد عضويتك'
  const message = status === 'approved' && !active ? 'تمارا تعالج الدفعة، وستتفعّل العضوية تلقائياً خلال لحظات.' : active ? 'أصبح رصيدك وعقد العضوية جاهزين في حسابك.' : 'لم يتم تفعيل العضوية، ويمكنك العودة واختيار طريقة دفع أخرى.'
  return <div className="mx-auto max-w-xl px-4 py-12" dir="rtl"><div className="rounded-lg border border-border bg-card p-8 text-center shadow-lg">{status === 'approved' && !active && <div className="mb-4 flex justify-center"><LoadingSpinner size="lg" /></div>}<h1 className="text-2xl font-black text-dark">{title}</h1><p className="mt-3 text-sm leading-7 text-muted">{message}</p><Button onClick={() => router.push(active ? '/dashboard/membership' : membershipId ? `/memberships/payment/${membershipId}` : '/dashboard/membership')} className="mt-6 w-full">{active ? 'فتح عضويتي' : 'العودة للدفع'}</Button></div></div>
}

export default function MembershipTamaraCallbackPage() {
  return <Suspense fallback={<div className="p-12"><LoadingSpinner size="lg" /></div>}><CallbackContent /></Suspense>
}
