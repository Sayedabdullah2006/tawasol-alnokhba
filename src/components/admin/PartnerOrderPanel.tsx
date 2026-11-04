'use client'
import { useEffect, useState } from 'react'
import { initialPartnerDeliverables } from '@/lib/partners/deliverables'
import type { PackageBenefit } from '@/lib/individual-package-benefits'
interface Deliverable { label: string; status: string; url: string }
interface Panel { source_site: string; external_customer_id: string; files: { id: string; name: string }[]; partner_deliverables: Deliverable[]; package_snapshot: { package: { name: string; features: string[]; benefits?: PackageBenefit[] }; pricing: { advertising: number } } | null; payments: { id: string; status: string }[] }
export default function PartnerOrderPanel({ id }: { id: string }) {
  const [data, setData] = useState<Panel | null>(null); const [items, setItems] = useState<Deliverable[]>([]); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false)
  useEffect(() => { fetch(`/api/admin/partner-orders/${id}`).then(async r => {
    if (!r.ok) throw new Error(); const d = await r.json(); setData(d)
    setItems(d.partner_deliverables?.length ? d.partner_deliverables : d.package_snapshot ? initialPartnerDeliverables(d.package_snapshot.package) : [{label:'رابط النشر',status:'pending',url:''}])
  }).catch(() => setMessage('تعذر تحميل تفاصيل الطلب.')) }, [id])
  async function save() {
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/admin/partner-orders/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverables: items }) })
      if (!response.ok) throw new Error(); setMessage('حُفظت المخرجات؛ تظهر للعميل عبر الربط.')
    } catch { setMessage('تعذر الحفظ؛ تحقق من الروابط وأعد المحاولة.') } finally { setSaving(false) }
  }
  return <section className="rounded-xl border border-border bg-card p-5 space-y-4">
    <h2 className="font-bold">مخرجات الطلب ومصدره</h2>
    {data && <><p className="text-sm">المصدر: {data.source_site === 'awwal-saudi' ? 'أول سعودي' : data.source_site || 'تواصل النخبة'} · {data.package_snapshot ? <>الباقة: {data.package_snapshot.package.name} · ميزانية الإعلان المشمولة: {data.package_snapshot.pricing.advertising / 100} ريال</> : 'طلب جهة — تسعير يدوي'}</p>
      {data.payments.some(p => p.status === 'review_required') && <p role="alert" className="text-red-700">توجد دفعة تحتاج مراجعة مالية. راجع جلسات الدفع قبل إغلاق الطلب.</p>}
      {data.files.length > 0 && <ul className="space-y-2">{data.files.map(file => <li key={file.id}><a href={`/api/admin/partner-files/${file.id}`} className="underline" target="_blank" rel="noreferrer">{file.name}</a></li>)}</ul>}
      <div className="space-y-3">{items.map((item, index) => <div key={index} className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_150px]">
        <p className="text-sm leading-7">{item.label}</p><select aria-label={`حالة ${item.label}`} value={item.status} onChange={e => setItems(prev => prev.map((v, i) => i === index ? { ...v, status: e.target.value } : v))} className="border border-border rounded-lg p-2"><option value="pending">بانتظار التنفيذ</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتمل</option></select>
        <input type="url" dir="ltr" aria-label={`رابط ${item.label}`} placeholder="https://" value={item.url} onChange={e => setItems(prev => prev.map((v, i) => i === index ? { ...v, url: e.target.value } : v))} className="sm:col-span-2 border border-border rounded-lg px-3 py-2" />
      </div>)}</div><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-dark text-white px-5 py-3 disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ مخرجات الطلب'}</button></>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
