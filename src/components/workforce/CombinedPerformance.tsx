import type {OverallPerformance} from '@/lib/workforce/overall-performance';
const number=(value:number|null)=>value===null?'—':`${value}%`;
export default function CombinedPerformance({value,showTotal=true}:{value:OverallPerformance;showTotal?:boolean}){
 return <section aria-label="التقييم الكلي" className="space-y-3 py-3 text-sm">
  {showTotal&&<p className="flex items-center justify-between gap-4 font-bold"><span>{value.mode==='combined'?'التقييم الكلي':'تقييم المهام'}</span><strong className="text-xl tabular-nums">{number(value.score)}</strong></p>}
  {value.mode==='combined'&&<dl className="grid grid-cols-2 gap-3"><div><dt>المبيعات · وزن {value.salesWeight}%</dt><dd className="mt-1 font-bold tabular-nums">{number(value.sales)}</dd></div><div><dt>المهام المسندة · وزن {value.taskWeight}%</dt><dd className="mt-1 font-bold tabular-nums">{number(value.tasks)}</dd></div></dl>}
  {value.pending.length>0&&<p role="status" className="text-xs">{value.pending.join(' · ')}. لم تصدر الدرجة الكلية بعد.</p>}
 </section>;
}
