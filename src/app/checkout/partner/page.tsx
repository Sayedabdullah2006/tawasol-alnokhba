'use client'
import { useEffect, useRef, useState } from 'react'
import PaymentForm from '@/components/payment/PaymentForm'

interface Checkout { publishable_key: string; payment_mode: string; amount: number; title: string; package_name: string; request_number: number; status: string; return_url: string; metadata: Record<string, string> }
export default function PartnerCheckoutPage() {
  const [data, setData] = useState<Checkout | null>(null)
  const [error, setError] = useState('')
  const bootStarted = useRef(false)
  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true
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
  return <section className="first1-checkout">
    <header className="first1-checkout-title"><h1>إتمام الدفع</h1><a href={data?.return_url || 'https://www.first1saudi.net/services/orders'}>العودة إلى الطلب</a></header>
    {error ? <div className="first1-checkout-state" role="alert"><h2>تعذر فتح الدفع</h2><p>{error}</p><a className="first1-checkout-button" href="https://www.first1saudi.net/services/orders">طلباتي</a></div> : !data ? <div className="first1-checkout-state" role="status">جارٍ تحميل الطلب…</div> : <>
      {data.payment_mode === 'sandbox' && <p role="status" className="first1-checkout-test">دفع تجريبي — لا يُخصم مبلغ فعلي</p>}
      <div className="first1-checkout-grid">
        <aside className="first1-checkout-order"><span className="first1-checkout-number">طلب #{data.request_number}</span><h2>{data.title}</h2><dl><div><dt>الخدمة</dt><dd>{data.package_name || 'طلب نشر'}</dd></div><div className="first1-checkout-total"><dt>الإجمالي</dt><dd>{new Intl.NumberFormat('ar-SA', {style:'currency',currency:'SAR'}).format(data.amount / 100)}</dd></div></dl><p className="first1-checkout-seller">تُقدَّم هذه الخدمة وتُباع بواسطة شركة تواصل النخبة للدعاية والإعلان، ويُعالج الدفع عبر ميسر لحساب الشركة. يمكنك متابعة طلبك من خلال أول سعودي.</p></aside>
        <div className="first1-checkout-form"><h2>بيانات الدفع</h2>{data.status === 'payable' ? <PaymentForm publishableKey={data.publishable_key} className="partner-payment" compact amount={data.amount / 100} description={`طلب ${data.request_number} — ${data.package_name || 'نشر خبر'}`} metadata={data.metadata} /> : <p role="status" className="first1-checkout-state">{data.status === 'paid' ? 'تم تأكيد السداد' : 'الطلب غير متاح للدفع حاليًا'}</p>}</div>
      </div>
    </>}
  </section>
}
