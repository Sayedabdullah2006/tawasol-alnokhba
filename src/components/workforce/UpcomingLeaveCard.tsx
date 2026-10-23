import {leaveDate,type UpcomingLeave} from "@/lib/workforce/upcoming-leave";
export default function UpcomingLeaveCard({items}:{items:UpcomingLeave[]}){
 return <section aria-labelledby="upcoming-leave-title" className="portal-panel rounded-2xl border border-white/15 bg-[#10243c]/95 p-5 text-white">
  <h2 id="upcoming-leave-title" className="mb-4 font-black">الإجازات القادمة</h2>
  {items.length?<div className="grid gap-3 sm:grid-cols-2">{items.map(item=><article key={item.id} className={`rounded-xl border p-4 ${item.source==="holiday"?"border-amber-200/25 bg-amber-200/5":item.paid?"border-emerald-200/25 bg-emerald-200/5":"border-rose-200/25 bg-rose-200/5"}`}>
   <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 flex-1 text-sm font-bold">{item.title}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${item.paid?"bg-emerald-300/15 text-emerald-200":"bg-rose-300/15 text-rose-200"}`}>{item.paymentLabel??(item.paid?"مدفوعة":"غير مدفوعة")}</span></div>
   <p className="mt-2 text-[11px] text-slate-300">{item.source==="holiday"?"إجازة رسمية":"طلب إجازة معتمد"}{item.ongoing&&<span className="mr-2 text-amber-200">جارية الآن</span>}</p>
   <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">البداية</dt><dd className="mt-1 font-bold">{leaveDate(item.starts_on)}</dd></div><div><dt className="text-slate-400">النهاية</dt><dd className="mt-1 font-bold">{leaveDate(item.ends_on)}</dd></div></dl>
  </article>)}</div>:<p className="text-sm text-slate-300">لا توجد إجازات قادمة</p>}
 </section>;
}
