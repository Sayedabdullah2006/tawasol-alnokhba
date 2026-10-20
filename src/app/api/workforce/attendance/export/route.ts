import { apiError, requireAdmin, workforceActor } from "@/lib/workforce/server";
import { attendanceMonth, employeeMonthAttendance } from "@/lib/workforce/attendance-server";
import { attendanceWorkbook, type AttendanceExportEmployee } from "@/lib/workforce/attendance-export";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await workforceActor(); requireAdmin(actor);
    const now = new Date(), month = attendanceMonth(new URL(request.url).searchParams.get("month"), now);
    const employees: AttendanceExportEmployee[] = [];
    for (let offset=0; ; offset+=500) {
      const page = await actor.db.from("wf_employees").select("id,full_name,job_title,start_date").order("full_name").order("id").range(offset,offset+499);
      if(page.error)throw page.error;
      for(const employee of page.data){
        const {summary,periods}=await employeeMonthAttendance(actor.db,employee.id,employee.start_date,month,now);
        employees.push({...employee,summary,periods});
      }
      if(page.data.length<500)break;
    }
    const bytes = await attendanceWorkbook(month,employees,now);
    return new Response(bytes, { headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":`attachment; filename="nukhba-attendance-${month}.xlsx"`,
      "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff",
    } });
  } catch(error) { return apiError(error); }
}
