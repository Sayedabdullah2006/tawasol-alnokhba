import type {Meeting} from './meetings';
const DAY=86400000;
export const CALENDAR_WEEKDAYS=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
export function meetingDay(value:string|number){return new Date(new Date(value).getTime()+3*3600000).toISOString().slice(0,10);}
export function addCalendarDays(day:string,days:number){return new Date(Date.parse(`${day}T12:00:00Z`)+days*DAY).toISOString().slice(0,10);}
export function shiftCalendarMonth(day:string,offset:number){const [y,m,d]=day.split('-').map(Number),target=new Date(Date.UTC(y,m-1+offset,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);}
export function calendarWeek(day:string){const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();const first=addCalendarDays(day,-((weekday+1)%7));return Array.from({length:7},(_,i)=>addCalendarDays(first,i));}
export function calendarMonth(month:string){const first=calendarWeek(`${month}-01`)[0];return Array.from({length:42},(_,i)=>addCalendarDays(first,i));}
export function meetingCalendarRange(month:string){if(!/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(month))throw Error('الشهر غير صحيح');const days=calendarMonth(month);return {from:`${days[0]}T00:00:00+03:00`,until:`${addCalendarDays(days[41],1)}T00:00:00+03:00`};}
export function meetingsOnDay(meetings:Meeting[],day:string){const from=Date.parse(`${day}T00:00:00+03:00`),until=from+DAY;return meetings.filter(m=>m.status==='scheduled'&&Date.parse(m.starts_at)<until&&Date.parse(m.ends_at)>from).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.id.localeCompare(b.id));}
export const calendarTime=(value:string)=>new Date(value).toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit'});
export const calendarDate=(day:string,monthOnly=false)=>new Date(`${day}T12:00:00Z`).toLocaleDateString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',...(monthOnly?{month:'long',year:'numeric'} as const:{weekday:'long',day:'numeric',month:'long'} as const)});
