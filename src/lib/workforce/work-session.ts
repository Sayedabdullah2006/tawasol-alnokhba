import type { AttendancePeriod } from "./attendance-summary";
export type WorkSession = AttendancePeriod & {id:string; business_date:string; close_reason:string|null};
export type WorkSegment = {id:string;task_id:string|null;kind:"task"|"activity"|"break"|"unallocated";title:string;starts_at:string;ends_at:string|null;paid_until:string|null};
export type WorkSnapshot = {now:string;paidHoliday?:string|null;todaySeconds:number;canControl?:boolean;session:WorkSession|null;lastSession:WorkSession|null;active:WorkSegment|null;breakUsedSeconds:number;tasks:{id:string;title:string;due_at:string|null;state:string}[]};
export type WorkCommand = "in"|"out"|"task"|"activity"|"break"|"resume"|"confirm"|"heartbeat";
export type WorkInput = {command:WorkCommand;request_key:string;session_id:string|null;task_id?:string;title?:string};
export const isFriday=(now:number|string)=>new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Riyadh",weekday:"short"}).format(new Date(now))==="Fri";
export const CLOSE_REASONS:Record<string,string>={manual:"انصراف",day_end:"نهاية الدوام · 5 مساءً",connection_lost:"انقطاع اتصال جلسة العمل",confirmation_missed:"لم يؤكد استمرار العمل"};
