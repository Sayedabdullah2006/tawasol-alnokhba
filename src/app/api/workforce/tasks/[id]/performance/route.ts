import {requestTestRun,requireTestTask} from "@/lib/workforce/test-mode";
import { apiError, assertMutation, createServiceRoleClient, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
type Context={params:Promise<{id:string}>};
async function visibleTask(id:string){const actor=await workforceActor();const {data:task,error}=await actor.db.from("wf_tasks").select("id,version,assignee_id,co_assignee_ids,assignee_admin_id").eq("id",id).is("archived_at",null).maybeSingle();if(error)throw error;if(!task)throw new WorkforceError("المهمة غير متاحة",404);return {actor,task};}
export async function GET(_request:Request,context:Context){try{const {actor,task}=await visibleTask(uuid((await context.params).id));const service=await createServiceRoleClient();const result=await service.from("wf_performance_assignments").select("employee_id,size,responsibility,configured_at,due_at,sealed,starts_at,weight_due_at,participant_count").eq("task_id",task.id).eq("withdrawn",false);if(result.error)throw result.error;
 const ids=[task.assignee_id,...task.co_assignee_ids].filter(Boolean),reviewer=actor.canManageTasks&&(!actor.employee||!ids.includes(actor.employee.id));
 const names=ids.length?await service.from("wf_employees").select("id,full_name").in("id",ids):{data:[],error:null};if(names.error)throw names.error;
 let evidence=service.from("wf_performance_deliveries").select("employee_id,round,summary,delivered_at,status").eq("task_id",task.id).order("round",{ascending:false});if(!reviewer)evidence=evidence.eq("employee_id",actor.employee?.id??"00000000-0000-0000-0000-000000000000");const contributions=await evidence;if(contributions.error)throw contributions.error;
 return privateResponse({members:names.data?.map(e=>({...e,config:result.data.find(c=>c.employee_id===e.id)??null,contribution:contributions.data.find(d=>d.employee_id===e.id)??null}))??[],own:actor.employee?.id??null,shared:ids.length+(task.assignee_admin_id?1:0)>1,hasDeliveries:contributions.data.length>0,canConfigure:reviewer});
 }catch(error){return apiError(error);}}
export async function POST(request:Request,context:Context){try{await assertMutation(request);const {actor,task}=await visibleTask(uuid((await context.params).id));await requireTestTask(actor,await requestTestRun(request,actor),task.id);const input=await request.json();if(!input||!['configure','contribute','exception'].includes(input.command)||!Number.isInteger(input.version)||!input.payload||typeof input.payload!=='object')throw new WorkforceError("بيانات الإجراء غير صحيحة");
 const service=await createServiceRoleClient();const {data,error}=await service.rpc("wf_performance_command",{p_actor:actor.user.id,p_task:task.id,p_version:input.version,p_command:input.command,p_payload:input.payload,p_key:uuid(input.request_key)});if(error)throw error;return privateResponse(data);
 }catch(error){return apiError(error);}}
