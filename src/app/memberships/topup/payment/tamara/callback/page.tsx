'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function Callback() {
  const params = useSearchParams(); const router = useRouter(); const status = params.get('status'); const topupId = params.get('topupId'); const [paid, setPaid] = useState(false)
  useEffect(() => { if (status !== 'approved' || !topupId) return; let attempts = 0; const timer = window.setInterval(async () => { attempts += 1; const response = await fetch(`/api/memberships/topups/${topupId}`); const data = await response.json().catch(() => ({})); if (data.topup?.status === 'paid') { setPaid(true); window.clearInterval(timer) } else if (attempts >= 8) window.clearInterval(timer) }, 2000); return () => window.clearInterval(timer) }, [status, topupId])
  const approved = status === 'approved'; const title = status === 'cancelled' ? 'تم إلغاء الدفع' : status === 'failed' ? 'تعذر إتمام الدفع' : paid ? 'تم تعزيز رصيدك' : 'يجري تأكيد الدفعة'; const message = approved && !paid ? 'تمارا تعالج الدفعة، وسيضاف الرصيد تلقائياً خلال لحظات.' : paid ? 'أصبحت الوحدات الإضافية متاحة في عضويتك.' : 'لم تتم إضافة الرصيد ويمكنك العودة واختيار طريقة أخرى.'
  return <div className="mx-auto max-w-xl px-4 py-12" dir="rtl"><div className="rounded-lg border border-border bg-card p-8 text-center shadow-lg">{approved && !paid && <div className="mb-4 flex justify-center"><LoadingSpinner size="lg"/></div>}<h1 className="text-2xl font-black text-dark">{title}</h1><p className="mt-3 text-sm text-muted">{message}</p><Button onClick={() => router.push(paid ? '/dashboard/membership' : topupId ? `/memberships/topup/payment/${topupId}` : '/dashboard/membership/topup')} className="mt-6 w-full">{paid ? 'عرض عضويتي' : 'العودة للدفع'}</Button></div></div>
}
export default function TamaraTopupCallbackPage() { return <Suspense fallback={<div className="p-12"><LoadingSpinner size="lg"/></div>}><Callback/></Suspense> }
