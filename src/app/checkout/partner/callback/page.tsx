'use client'
import { useEffect, useState } from 'react'

export default function PartnerPaymentResult() {
  const [message, setMessage] = useState('جارٍ التحقق من الدفع…')
  const [back, setBack] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const tamara=query.get('provider')==='tamara'
    const id = tamara?'tamara':query.get('id')
    const endpoint = `/api/partner-checkout?session=${encodeURIComponent(query.get('session') ?? '')}`
    fetch(endpoint, { cache: 'no-store' }).then(r => r.json()).then(d => { if (d.return_url) setBack(d.return_url); if (!id) setMessage('لم نتلقَّ رقم عملية دفع. راجع حالة طلبك قبل إعادة المحاولة.') }).catch(() => undefined)
    if (!id) return
    fetch(endpoint+(tamara?'&action=tamara-verify':''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_id: id }) }).then(async r => {
      const data = await r.json()
      if (data.return_url) setBack(data.return_url)
      setMessage(!r.ok ? 'تعذر تأكيد الدفع الآن. راجع حالة طلبك قبل إجراء دفعة جديدة.' : data.paid ? 'تم تأكيد السداد. طلبك لدى فريق تواصل النخبة.' : data.review_required ? 'وصلت العملية وتحتاج مراجعة مالية. لا تكرر الدفع.' : ['failed','voided'].includes(data.status) ? 'لم تكتمل عملية الدفع. يمكنك العودة إلى طلبك للمحاولة.' : 'لم يتأكد السداد بعد. يمكنك تحديث الحالة.')
    }).catch(() => setMessage('تعذر الاتصال للتحقق. قد تكون العملية تمت؛ راجع حالة طلبك قبل إعادة الدفع.'))
  }, [attempt])
  return <section className="first1-checkout"><header className="first1-checkout-title"><h1>نتيجة الدفع</h1></header><div className="first1-checkout-state"><p role="status">{message}</p><button type="button" onClick={() => setAttempt(n => n + 1)} className="first1-checkout-button">تحديث حالة الدفع</button>{back && <a href={back} className="block mt-6 py-3 underline">العودة إلى الطلب</a>}</div></section>
}
