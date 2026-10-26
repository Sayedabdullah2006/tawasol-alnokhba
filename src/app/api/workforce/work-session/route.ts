import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { workforceActor, assertMutation, apiError, createServiceRoleClient, requireEmployeeAccess } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

async function overtimeWindow(actor: Awaited<ReturnType<typeof workforceActor>>) {
  if (!actor.employee) return null;
  const now = new Date().toISOString();
  const result = await actor.db.from("wf_employee_requests").select("ends_at").eq("employee_id",actor.employee.id).eq("kind","overtime").eq("status","approved").is("test_run_id",null).lte("starts_at",now).gt("ends_at",now).order("starts_at").limit(1).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function GET(request: Request) {
  try {
    const actor=await workforceActor();
    const employee=actor.employee?.id ?? uuid(new URL(request.url).searchParams.get("employee_id"));
    requireEmployeeAccess(actor,employee);
    const service=await createServiceRoleClient();
    const result=await service.rpc("wf_work_snapshot",{p_actor:actor.user.id,p_employee:employee});
    if(result.error) throw result.error;
    let canControl=actor.employee?.allow_mobile_attendance===true || !result.data.session || result.data.session.policy_version===0;
    const device=(await cookies()).get("wf_work_device")?.value;
    if(!actor.employee?.allow_mobile_attendance&&result.data.session?.policy_version===1&&device){
      const owner=await actor.db.from("wf_attendance_sessions").select("device_hash").eq("id",result.data.session.id).eq("employee_id",employee).maybeSingle();
      if(owner.error)throw owner.error;
      canControl=owner.data?.device_hash===createHash("sha256").update(device).digest("hex");
    }
    return privateResponse({...result.data,canControl,overtimeWindow:await overtimeWindow(actor)});
  } catch(error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor=await workforceActor();
    if(!actor.employee) throw new WorkforceError("تسجيل الدوام من حساب الموظفة فقط",403);
    const body=await request.json();
    if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(key=>!["command","request_key","session_id","task_id","title"].includes(key))) throw new WorkforceError("بيانات الإجراء غير صحيحة");
    const allowed=["in","out","task","activity","break","resume","confirm","heartbeat"];
    if(!allowed.includes(body.command)) throw new WorkforceError("إجراء غير صحيح");
    // A browser device restriction, not hardware attestation. The server owns session times.
    if(body.command==="in" && !actor.employee.allow_mobile_attendance && /Android|iPhone|iPad|iPod|Mobile/i.test(request.headers.get("user-agent")??"")) throw new WorkforceError("سجلي الحضور من جهاز الكمبيوتر",403);
    const jar=await cookies();
    let device=jar.get("wf_work_device")?.value;
    if(!device && !actor.employee.allow_mobile_attendance && !["in","out"].includes(body.command)) throw new WorkforceError("افتحي الدوام من الجهاز الذي سجلتِ منه الحضور",403);
    if(!device) { device=randomBytes(32).toString("hex");jar.set("wf_work_device",device,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"}); }
    const title=body.title??"";
    if(typeof title!=="string" || title.length>200) throw new WorkforceError("عنوان النشاط غير صحيح");
    const result=await (await createServiceRoleClient()).rpc("wf_work_command",{
      p_actor:actor.user.id,p_command:body.command,p_key:uuid(body.request_key),
      p_session:body.session_id?uuid(body.session_id):null,
      p_device:createHash("sha256").update(device).digest("hex"),
      p_task:body.task_id?uuid(body.task_id):null,p_title:title,
    });
    if(result.error) throw result.error;
    return privateResponse({...result.data,canControl:true,overtimeWindow:await overtimeWindow(actor)});
  } catch(error) {return apiError(error);}
}
