import Link from 'next/link';
import {salesSnapshot} from '@/lib/workforce/sales-server';
import {evaluateSales,riyadhToday,type SalesData} from '@/lib/workforce/sales';
import type {WorkforceActor} from '@/lib/workforce/server';
export default async function SalesSummary({actor}:{actor:WorkforceActor}){
 const admin=actor.role==='admin',base=admin?'/admin/workforce/sales':'/employee/performance/goals';
 let data:SalesData|undefined;try{data=await salesSnapshot(actor,riyadhToday().slice(0,7));}catch{}
 if(!data)return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm">تعذر تحميل ملخص أهداف المبيعات. <Link href={base} className="underline">فتح الأهداف والمحاولة مجددًا</Link></p>;
 if(!data.month)return null;
 const plans=data.plans.filter(p=>admin||p.employee_id===actor.employee?.id);
 return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">أهداف المبيعات — {data.month.month.slice(0,7)}</h2><Link className="text-sm underline" href={admin?base+'/goals':base}>الأهداف والمهام الأسبوعية</Link></div><div className="mt-4 flex flex-wrap gap-6">{plans.map(p=>{const e=evaluateSales(p,data.activities);return <p key={p.id} className="text-sm">{data.employees.find(x=>x.id===p.employee_id)?.full_name}: <strong className="tabular-nums">{e.total??'—'}%</strong> <span className="text-slate-600">نتيجة أولية</span></p>;})}</div><div className="mt-4 flex flex-wrap gap-5 text-sm"><Link className="underline" href={admin?base+'/crm':'/employee/crm'}>العملاء والفرص CRM</Link><Link className="underline" href={admin?base+'/competition':'/employee/performance/competition'}>لوحة التنافس</Link><Link className="underline" href={admin?base+'/reviews':'/employee/performance/reviews'}>تقييم المبيعات</Link></div></section>;

}
