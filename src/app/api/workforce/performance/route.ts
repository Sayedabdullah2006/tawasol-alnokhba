import { apiError, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { attendanceMonth } from "@/lib/workforce/attendance-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import { employeePerformance } from "@/lib/workforce/performance-server";
export async function GET(request:Request){try{const actor=await workforceActor(),params=new URL(request.url).searchParams;const id=params.get("employee_id")??actor.employee?.id;if(!id)throw new WorkforceError("اختر الموظفة");return privateResponse(await employeePerformance(actor,uuid(id),attendanceMonth(params.get("month"))));}catch(error){return apiError(error);}}
