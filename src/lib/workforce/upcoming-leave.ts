import {fixedPaidHoliday,type PaidCalendarDay} from "./calendar";
export type UpcomingLeave={id:string;title:string;starts_on:string;ends_on:string;paid:boolean;source:"holiday"|"request";ongoing:boolean};
export type ApprovedLeaveRow={id:string;employee_id:string;title:string;kind:string;status:string;leave_type:string;starts_at:string|null;ends_at:string|null;test_run_id:string|null};
const dayOf=(value:string)=>new Date(value).toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"});
const addDays=(day:string,count:number)=>new Date(Date.parse(`${day}T12:00:00Z`)+count*86400000).toISOString().slice(0,10);
/** Personal approved leave and company holidays stay separate, even when dates overlap. */
export function upcomingLeave({employeeId,startDate,today,calendar,requests}:{employeeId:string;startDate:string;today:string;calendar:PaidCalendarDay[];requests:ApprovedLeaveRow[]}):UpcomingLeave[]{
 const cutoff=today>startDate?today:startDate,dates=new Map(calendar.map(d=>[d.day,d.title]));
 for(const year of [Number(today.slice(0,4)),Number(today.slice(0,4))+1])for(const suffix of ["02-22","09-23"]){const day=`${year}-${suffix}`;dates.set(day,fixedPaidHoliday(day)!);}
 const rows:UpcomingLeave[]=[];
 for(const [day,title] of [...dates].sort(([a],[b])=>a.localeCompare(b))){
  const previous=rows.at(-1);
  if(previous?.source==="holiday"&&previous.title===title&&addDays(previous.ends_on,1)===day)previous.ends_on=day;
  else rows.push({id:`holiday:${day}`,title,starts_on:day,ends_on:day,paid:true,source:"holiday",ongoing:false});
 }
 const seen=new Set<string>();
 for(const q of requests){
  if(q.employee_id!==employeeId||q.kind!=="leave"||q.status!=="approved"||q.test_run_id||!q.starts_at||!q.ends_at||seen.has(q.id))continue;
  if(!Number.isFinite(Date.parse(q.starts_at))||!Number.isFinite(Date.parse(q.ends_at)))continue;
  const starts=dayOf(q.starts_at),ends=dayOf(q.ends_at);if(ends<starts)continue;
  seen.add(q.id);rows.push({id:`request:${q.id}`,title:q.title||"إجازة معتمدة",starts_on:starts,ends_on:ends,paid:q.leave_type==="paid",source:"request",ongoing:false});
 }
 return rows.filter(r=>r.ends_on>=cutoff).map(r=>({...r,ongoing:r.starts_on<=today&&r.ends_on>=today})).sort((a,b)=>a.starts_on.localeCompare(b.starts_on)||a.ends_on.localeCompare(b.ends_on)||a.id.localeCompare(b.id));
}
export const leaveDate=(day:string)=>new Date(`${day}T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Riyadh"});
