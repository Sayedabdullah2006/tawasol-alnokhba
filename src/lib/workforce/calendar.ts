export function fixedPaidHoliday(day:string):string|null{
 return day.slice(5,10)==='02-22'?'يوم التأسيس':day.slice(5,10)==='09-23'?'اليوم الوطني السعودي':null;
}
export const paidHolidayAt=(now:string|number)=>fixedPaidHoliday(new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'}));
