import {notFound} from 'next/navigation';
import {workforceActor} from '@/lib/workforce/server';
import {salesSnapshot} from '@/lib/workforce/sales-server';
import {riyadhToday} from '@/lib/workforce/sales';
import {uuid} from '@/lib/workforce/validation';
import SalesQuotePrint from './SalesQuotePrint';
import styles from './sales.module.css';
export default async function SalesQuote({id}:{id:string}){
 const actor=await workforceActor();try{uuid(id);}catch{notFound();}
 const data=await salesSnapshot(actor,riyadhToday().slice(0,7));const a=data.activities.find(a=>a.id===id&&a.metric==='quote');if(!a)notFound();
 const account=data.accounts.find(c=>c.id===a.account_id),opp=data.opportunities.find(o=>o.id===a.opportunity_id);
 return <article dir="rtl" className={`${styles.quote} mx-auto my-6 max-w-4xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-900 print:my-0 print:border-0 print:p-0 md:p-10`}><header className="flex flex-wrap justify-between gap-4"><div><p className="text-sm">تواصل النخبة</p><h1 className="text-2xl font-bold">عرض سعر {a.reference}</h1><p className="mt-2 text-sm">{a.status==='approved'?'معتمد داخليًا':'مسودة للمراجعة — لا يمثل عرضًا معتمدًا'}</p></div><SalesQuotePrint/></header><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-600">الجهة</dt><dd>{account?.name}</dd></div><div><dt className="text-slate-600">التاريخ</dt><dd>{a.occurred_on}</dd></div><div><dt className="text-slate-600">الخدمة</dt><dd>{opp?.service}</dd></div><div><dt className="text-slate-600">مسؤولة العرض</dt><dd>{data.employees.find(e=>e.id===a.employee_id)?.full_name}</dd></div></dl><section><h2 className="mb-3 text-lg font-bold">نطاق العرض وشروطه</h2><p className="whitespace-pre-wrap leading-8">{a.summary}</p><p className="mt-3 whitespace-pre-wrap leading-8">{a.details||'لم تستكمل تفاصيل النطاق وشروط الدفع والصلاحية بعد.'}</p></section><div className="flex justify-between border-y border-slate-200 py-5"><span>المبلغ المسجل للعرض</span><strong className="text-xl tabular-nums">{Number(a.amount).toLocaleString('en-US',{minimumFractionDigits:2})} ر.س</strong></div>{a.evidence_attachment_id?<a className="text-sm underline" href={`/api/workforce/sales/opportunities/${a.opportunity_id}/files/${a.evidence_attachment_id}`}>تنزيل نسخة العرض الأصلية</a>:a.evidence_url&&<a className="text-sm underline" href={a.evidence_url} target="_blank" rel="noopener noreferrer">فتح نسخة العرض الأصلية</a>}</article>;
}
