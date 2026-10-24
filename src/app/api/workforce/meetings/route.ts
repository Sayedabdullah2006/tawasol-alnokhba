import {workforceActor,createServiceRoleClient,assertMutation,apiError} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {meetingColumns,googleConnection,publicMeetingConnection,syncMeeting} from '@/lib/workforce/meeting-server';
import {meetingCalendarRange,meetingDay} from '@/lib/workforce/meeting-calendar';
import {uuid,WorkforceError} from '@/lib/workforce/validation';
export async function GET(request:Request){try{
 const actor=await workforceActor(),service=await createServiceRoleClient(),directory=await service.rpc('wf_meeting_directory',{p_actor:actor.user.id});if(directory.error)throw directory.error;
 const params=new URL(request.url).searchParams,dashboard=params.get('dashboard')==='true';
 const month=params.get('month')||meetingDay(Date.now()).slice(0,7);let range;
 try{range=meetingCalendarRange(month);}catch{throw new WorkforceError('الشهر غير صحيح');}
 const meetings=[];
 for(let offset=0;;offset+=500){
  let query=actor.db.from('wf_meetings').select(meetingColumns).order('starts_at').order('id');
  if(dashboard)query=query.eq('status','scheduled').gte('ends_at',new Date().toISOString()).contains('participant_ids',[actor.user.id]).limit(5);
  else query=query.lt('starts_at',range.until).gt('ends_at',range.from).range(offset,offset+499);
  const rows=await query;if(rows.error)throw rows.error;meetings.push(...rows.data);if(dashboard||rows.data.length<500)break;
 }
 const requested=params.get('meeting');if(requested&&!dashboard&&!meetings.some(m=>m.id===requested)){const row=await actor.db.from('wf_meetings').select(meetingColumns).eq('id',uuid(requested)).maybeSingle();if(row.error)throw row.error;if(row.data)meetings.push(row.data);}
 let connection=null,schedulingReady=false;if(directory.data.can_manage){const c=await googleConnection(actor);schedulingReady=!!c.refresh_token_cipher;if(actor.role==='admin')connection=publicMeetingConnection(c,request,true);}
 const tasks=directory.data.can_manage&&!dashboard?await actor.db.from('wf_tasks').select('id,title').is('archived_at',null).is('test_run_id',null).order('due_at',{nullsFirst:false}).limit(200):{data:[],error:null};if(tasks.error)throw tasks.error;
 const attendance=[];for(let i=0;i<meetings.length;i+=100){for(let offset=0;;offset+=500){const rows=await actor.db.from('wf_meeting_attendance').select('meeting_id,user_id,joined_at,left_at').in('meeting_id',meetings.slice(i,i+100).map(m=>m.id)).order('meeting_id').order('user_id').range(offset,offset+499);if(rows.error)throw rows.error;attendance.push(...rows.data);if(rows.data.length<500)break;}}
 return privateResponse({meetings,attendance,people:directory.data.people,canManage:directory.data.can_manage,isAdmin:actor.role==='admin',userId:actor.user.id,connection,schedulingReady,tasks:tasks.data});
 }catch(error){return apiError(error);}}
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor(),body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','version','command','payload'].includes(k)))throw new WorkforceError('بيانات الاجتماع غير صحيحة');
 const id=uuid(body.id),version=body.version;if(!Number.isInteger(version)||version<0)throw new WorkforceError('نسخة الاجتماع غير صحيحة');
 if(['publish','cancel'].includes(body.command))return privateResponse({meeting:await syncMeeting(actor,request,id,version,body.command==='cancel')});
 if(body.command==='series_list'){const rows=await actor.db.from('wf_meetings').select(meetingColumns).eq('series_id',id).order('starts_at');if(rows.error)throw rows.error;return privateResponse({meetings:rows.data});}
 if(!['save','save_series','cancel_draft'].includes(body.command))throw new WorkforceError('إجراء الاجتماع غير صحيح');
 if(body.payload?.task_id){const task=await actor.db.from('wf_tasks').select('id').eq('id',uuid(body.payload.task_id)).maybeSingle();if(task.error)throw task.error;if(!task.data)throw new WorkforceError('المهمة المرتبطة غير متاحة',404);}
 if(body.command==='save_series'){
  if(version!==0||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new WorkforceError('بيانات التكرار غير صحيحة');
  const {frequency,count,...payload}=body.payload;
  const result=await (await createServiceRoleClient()).rpc('wf_meeting_series',{p_actor:actor.user.id,p_id:id,p_payload:payload,p_frequency:frequency,p_count:count});if(result.error)throw result.error;return privateResponse({meetings:result.data});
 }
 const result=await (await createServiceRoleClient()).rpc('wf_meeting_command',{p_actor:actor.user.id,p_id:id,p_version:version,p_command:body.command,p_payload:body.payload??{}});if(result.error)throw result.error;return privateResponse({meeting:result.data});
 }catch(error){return apiError(error);}}
