export function fixedPaidHoliday(day:string):string|null{
 return day.slice(5,10)==='02-22'?'يوم التأسيس':day.slice(5,10)==='09-23'?'اليوم الوطني السعودي':null;
}
export type PaidCalendarDay={day:string;title:string};
export function paidHoliday(day:string,days:PaidCalendarDay[]=[]):string|null {return fixedPaidHoliday(day)??days.find(item=>item.day===day)?.title??null;}
export const paidHolidayAt=(now:string|number,days:PaidCalendarDay[]=[])=>paidHoliday(new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'}),days);
