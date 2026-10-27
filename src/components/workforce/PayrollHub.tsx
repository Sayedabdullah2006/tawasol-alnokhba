"use client";
import { useEffect,useState } from "react";
import { EmployeePicker } from "./TaskFields";
import {api,Notice} from "./shared";
import FinalSettlementCard from "./FinalSettlementCard";
import MonthlyPayroll from "./MonthlyPayroll";
export default function PayrollHub() {
  const [employee, setEmployee] = useState("");
  const [resignations,setResignations]=useState<{id:string;employee_id:string;resignation_details:{employee_name:string}}[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('');
  useEffect(()=>{const abort=new AbortController();api<{requests:typeof resignations}>('/api/workforce/final-settlements',{signal:abort.signal}).then(v=>setResignations(v.requests)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>abort.abort();},[]);
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 md:p-8">
      <h1 className="text-3xl font-black">الرواتب والحوافز</h1>

      <Notice message={error} error/>
      {!!resignations.length&&<section className="space-y-4"><h2 className="text-xl font-bold">التسويات النهائية</h2><div className="flex flex-wrap gap-2">{resignations.map(r=><button className="rounded-xl border px-4 py-2" key={r.id} aria-pressed={selected===r.id} onClick={()=>setSelected(v=>v===r.id?'':r.id)}>{r.resignation_details.employee_name}</button>)}</div>{selected&&<FinalSettlementCard key={selected} requestId={selected}/>}</section>}
      {employee ? (
        <MonthlyPayroll
          key={employee}
          employeeId={employee}
          admin
          onClose={() => setEmployee("")}
        />
      ) : (
        <EmployeePicker
          value={employee}
          title="اختيار الموظفة لإدارة مستحقاتها"
          onChange={setEmployee}
        />
      )}
    </div>
  );
}
