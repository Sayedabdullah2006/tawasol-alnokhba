import {readFile} from "node:fs/promises";
import {renderWorkforceEmail,type WeeklyReport} from "../../../../../supabase/functions/_shared/workforce-email";
import type {PerformanceEvidence} from "@/lib/workforce/performance";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(process.env.NODE_ENV!=="development")return new Response(null,{status:404});
 const selected=new URL(request.url).searchParams.get("employee")==="monwa"?"monwa":"noor";
 const employeeId=selected==="noor"?"a4e79fa0-d078-4a7e-8650-196342a0dec3":"20941f23-a84c-44a9-a316-94a436e0d3cb";
 const [{evidence},reports]=await Promise.all([readFile('.preview/performance-history.json','utf8').then(s=>JSON.parse(s) as {evidence:PerformanceEvidence[]}),readFile('.preview/performance-weekly.json','utf8').then(s=>JSON.parse(s) as {employeeId:string;weeklyReport:WeeklyReport}[])]);
 const weeklyReport={...reports.find(r=>r.employeeId===employeeId)!.weeklyReport,performanceEvidence:evidence.filter(e=>e.employee_id===employeeId)};
 const mail=renderWorkforceEmail({email:'preview@example.invalid',name:selected==="noor"?"نور محمود باجنيد":"منوه صالح سالم",kind:'weekly_report',title:'التقرير الأسبوعي',href:'/employee',createdAt:weeklyReport.asOf,weeklyReport});
 return new Response(mail.html.replaceAll('href="https://nukhba.media/employee"','href="#"'),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex'}});
}
