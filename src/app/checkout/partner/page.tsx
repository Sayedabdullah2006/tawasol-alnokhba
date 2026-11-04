'use client'
import { useEffect, useState } from 'react'
import PaymentForm from '@/components/payment/PaymentForm'

interface Checkout { publishable_key: string; payment_mode: string; amount: number; title: string; package_name: string; request_number: number; status: string; return_url: string; metadata: Record<string, string> }
export default function PartnerCheckoutPage() {
  const [data, setData] = useState<Checkout | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    async function boot() {
      const token = new URLSearchParams(location.hash.slice(1)).get('token')
      if (token) {
        history.replaceState(null, '', location.pathname)
        const response = await fetch('/checkout/partner/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
        if (!response.ok) throw new Error()
        const session = await response.json()
        location.replace(`/checkout/partner?session=${encodeURIComponent(session.session_id)}`)
        return
      }
      const session = new URLSearchParams(location.search).get('session') ?? ''
      const response = await fetch(`/api/partner-checkout?session=${encodeURIComponent(session)}`, { cache: 'no-store' })
      const body = await response.json(); if (!response.ok) throw new Error(); setData(body)
    }
    boot().catch(() => setError('انتهت جلسة الدفع أو تعذر تحميلها. ارجع إلى أول سعودي وأعد فتح الدفع.'))
  }, [])
  return <main dir="rtl" className="mx-auto w-full max-w-xl px-5 py-12">
    <h1 className="text-2xl font-bold mb-3">الدفع لشركة تواصل النخبة</h1>
    <p className="text-sm leading-7 text-muted mb-6">طلبك من أول سعودي. تُقدَّم الخدمة وتُباع بواسطة شركة تواصل النخبة للدعاية والإعلان، وتُعالج المدفوعات عبر ميسر لحساب الشركة.</p>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">جارٍ تحميل الطلب…</p> : <>
      {data.payment_mode === 'sandbox' && <p role="status" className="mb-4 border border-border p-3">دفع تجريبي عبر ميسر Sandbox — لا يُخصم مبلغ فعلي.</p>}
      <dl className="border-y border-border py-4 mb-6 space-y-3 text-sm"><div className="flex justify-between"><dt>رقم الطلب</dt><dd>{data.request_number}</dd></div><div className="flex justify-between"><dt>الباقة</dt><dd>{data.package_name}</dd></div><div><dt className="text-muted">الخبر</dt><dd className="mt-1">{data.title}</dd></div></dl>
      {data.status === 'payable' ? <PaymentForm publishableKey={data.publishable_key} className="partner-payment" amount={data.amount / 100} description={`طلب ${data.request_number} — ${data.package_name}`} metadata={data.metadata} /> : <p role="status">{data.status === 'paid' ? 'تم تأكيد سداد هذا الطلب.' : 'الطلب غير متاح للدفع في حالته الحالية.'}</p>}
      <a href={data.return_url} className="block mt-6 py-3 underline">العودة إلى طلبك في أول سعودي</a>
    </>}
  </main>
}
