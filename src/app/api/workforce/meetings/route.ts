import {workforceActor,createServiceRoleClient,assertMutation,apiError} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {meetingColumns,googleConnection,publicMeetingConnection,syncMeeting} from '@/lib/workforce/meeting-server';
import {uuid,WorkforceError} from '@/lib/workforce/validation';
export async function GET(request:Request){try{
 const actor=await workforceActor(),service=await createServiceRoleClient(),directory=await service.rpc('wf_meeting_directory',{p_actor:actor.user.id});if(directory.error)throw directory.error;
 const dashboard=new URL(request.url).searchParams.get('dashboard')==='true';
 let query=actor.db.from('wf_meetings').select(meetingColumns).order('starts_at').order('id').limit(dashboard?5:100);
 if(dashboard)query=query.eq('status','scheduled').gte('ends_at',new Date().toISOString()).contains('participant_ids',[actor.user.id]);
 else query=query.gte('ends_at',new Date(Date.now()-30*86400000).toISOString());
 const rows=await query;if(rows.error)throw rows.error;
 let connection=null;if(directory.data.can_manage)connection=publicMeetingConnection(await googleConnection(actor),request,actor.role==='admin');
 const tasks=directory.data.can_manage&&!dashboard?await actor.db.from('wf_tasks').select('id,title').is('archived_at',null).is('test_run_id',null).order('due_at',{nullsFirst:false}).limit(200):{data:[],error:null};if(tasks.error)throw tasks.error;
 return privateResponse({meetings:rows.data,people:directory.data.people,canManage:directory.data.can_manage,isAdmin:actor.role==='admin',userId:actor.user.id,connection,tasks:tasks.data});
 }catch(error){return apiError(error);}}
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor(),body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','version','command','payload'].includes(k)))throw new WorkforceError('بيانات الاجتماع غير صحيحة');
 const id=uuid(body.id),version=body.version;if(!Number.isInteger(version)||version<0)throw new WorkforceError('نسخة الاجتماع غير صحيحة');
 if(['publish','cancel'].includes(body.command))return privateResponse({meeting:await syncMeeting(actor,request,id,version,body.command==='cancel')});
 if(!['save','cancel_draft'].includes(body.command))throw new WorkforceError('إجراء الاجتماع غير صحيح');
 if(body.payload?.task_id){const task=await actor.db.from('wf_tasks').select('id').eq('id',uuid(body.payload.task_id)).maybeSingle();if(task.error)throw task.error;if(!task.data)throw new WorkforceError('المهمة المرتبطة غير متاحة',404);}
 const result=await (await createServiceRoleClient()).rpc('wf_meeting_command',{p_actor:actor.user.id,p_id:id,p_version:version,p_command:body.command,p_payload:body.payload??{}});if(result.error)throw result.error;return privateResponse({meeting:result.data});
 }catch(error){return apiError(error);}}
