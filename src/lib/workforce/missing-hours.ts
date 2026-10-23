import {dateField,WorkforceError} from './validation';
export function missingHoursInput(day:unknown,hours:unknown){
 const work_day=dateField(day);
 if(!work_day||typeof hours!=='string'||!/^\d{1,2}(?:\.\d{1,2})?$/.test(hours))throw new WorkforceError('حددي اليوم وعدد الساعات');
 const missing_minutes=Number(hours)*60;
 if(!Number.isInteger(missing_minutes)||missing_minutes<1||missing_minutes>480)throw new WorkforceError('عدد الساعات من دقيقة إلى 8 ساعات');
 return {work_day,missing_minutes};
}
