import ExcelJS from "exceljs";
import { monthBounds, attendanceEnd, workedSeconds, type AttendancePeriod, type AttendanceSummary } from "./attendance-summary";

export type AttendanceExportEmployee = {
  full_name: string; job_title: string; start_date: string;
  summary: AttendanceSummary; periods: AttendancePeriod[];
};
/** Allocate overlapping corrections once, within the selected month and employment period. */
export function attendanceExportPeriods(periods: AttendancePeriod[], summary: AttendanceSummary) {
  const bounds = monthBounds(summary.month), from = Date.parse(`${summary.startsOn}T00:00:00+03:00`);
  const until = Math.min(Date.parse(`${bounds.next}T00:00:00+03:00`), Date.parse(summary.asOf));
  let previousEnd = from;
  return periods.filter(p=>!p.overtime_request_id).sort((a, b) => a.checked_in.localeCompare(b.checked_in)).map(period => {
    const start = Date.parse(period.checked_in);
    const end = Math.min(attendanceEnd(period,Date.parse(summary.asOf)), until);
    const seconds = workedSeconds([period],Math.max(start,from,previousEnd),until,Date.parse(summary.asOf));
    previousEnd = Math.max(previousEnd, end);
    return { ...period, seconds };
  });
}
const stamp = (value: string) => new Date(value).toLocaleString("sv-SE", {timeZone:"Asia/Riyadh"});
export async function attendanceWorkbook(month: string, employees: AttendanceExportEmployee[], now: Date) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "تواصل النخبة"; workbook.created = now;
  function sheet(name: string, headers: string[], widths: number[]) {
    const page = workbook.addWorksheet(name, { views: [{rightToLeft:true, state:"frozen", ySplit:4}], pageSetup:{orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0} });
    page.columns = widths.map(width => ({width}));
    page.mergeCells(1,1,1,headers.length); page.getCell(1,1).value = `تواصل النخبة | تقرير الحضور — ${month}`;
    page.getCell(1,1).font = {name:"Arial",size:16,bold:true,color:{argb:"FFFFFFFF"}};
    page.getCell(1,1).fill = {type:"pattern",pattern:"solid",fgColor:{argb:"FF102B57"}}; page.getRow(1).height=34;
    page.mergeCells(2,1,2,headers.length); page.getCell(2,1).value = `تاريخ التقرير: ${stamp(now.toISOString())} — توقيت الرياض`;
    page.getRow(2).height=26;
    page.getRow(4).values=headers; page.getRow(4).height=30;
    page.getRow(4).eachCell(cell => {cell.font={name:"Arial",bold:true,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF245978"}};});
    return page;
  }
  const summary = sheet("ملخص الموظفات", ["الموظفة","المسمى الوظيفي","تاريخ المباشرة","بداية الاحتساب","أيام العمل","المستهدف","المنجز","المتبقي","الإضافي","إجازات رسمية مدفوعة"], [30,28,18,18,16,18,18,18,18,24]);
  const periods = sheet("فترات الحضور والانصراف", ["الموظفة","الحضور — الرياض","الانصراف — الرياض","المدة المحتسبة بالشهر","الحالة"], [30,26,26,26,24]);
  const credits=sheet("الساعات المفقودة المعتمدة",["الموظفة","اليوم","الساعات المعتمدة","مرجع الطلب"],[30,22,24,42]);
  for (const employee of employees) {
    const s=employee.summary;
    const row=summary.addRow([employee.full_name,employee.job_title,employee.start_date,s.startsOn>s.endsOn?"—":s.startsOn,s.workdayCount,s.targetMinutes/1440,s.workedMinutes/1440,s.remainingMinutes/1440,s.extraMinutes/1440,s.paidHolidayMinutes/1440]);
    for(let column=6;column<=10;column++) row.getCell(column).numFmt='[h]:mm';
    const approved=new Map<string,{day:string;seconds:number}>();
    for(const period of attendanceExportPeriods(employee.periods,s)) {
      if(period.credit_request_id){const previous=approved.get(period.credit_request_id);approved.set(period.credit_request_id,{day:new Date(period.checked_in).toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'}),seconds:(previous?.seconds??0)+period.seconds});continue;}
      const effectiveEnd=attendanceEnd(period,Date.parse(s.asOf));
      const automatic=!period.checked_out && period.policy_version===1 && effectiveEnd<Date.parse(s.asOf);
      const row=periods.addRow([employee.full_name,stamp(period.checked_in),period.checked_out?stamp(period.checked_out):automatic?stamp(new Date(effectiveEnd).toISOString()):"—",period.seconds/86400,period.checked_out?"منصرفة":automatic?"انصراف تلقائي":Date.parse(s.asOf)>Date.parse(period.checked_in)+86400000?"يحتاج تصحيحًا":"فترة مفتوحة"]);
      row.getCell(4).numFmt='[h]:mm:ss';
    }
    for(const [id,item] of approved){const row=credits.addRow([employee.full_name,item.day,item.seconds/86400,id]);row.getCell(3).numFmt='[h]:mm:ss';}
  }
  for (const page of [summary,periods,credits]) {
    page.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,page.rowCount),column:page.columnCount}};
    page.eachRow((row,index) => { row.alignment={vertical:"middle",horizontal:"right",wrapText:true};if(index>=5){row.height=28;row.eachCell(cell=>{cell.font={name:"Arial",size:11};if(index%2)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFEEF5FA"}};});} });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
