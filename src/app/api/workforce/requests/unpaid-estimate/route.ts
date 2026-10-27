import {assertMutation,workforceActor,createServiceRoleClient,apiError} from '@/lib/workforce/server';
import {dateField,WorkforceError} from '@/lib/workforce/validation';
import {privateResponse} from '@/lib/workforce/task-server';
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();
 if(!actor.employee)throw new WorkforceError('التقدير متاح للموظفة صاحبة الطلب',403);
 const body=await request.json();
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['starts_on','ends_on'].includes(k)))throw new WorkforceError('بيانات الفترة غير صحيحة');
 const result=await (await createServiceRoleClient()).rpc('wf_unpaid_leave_estimate',{p_actor:actor.user.id,p_starts:dateField(body.starts_on),p_ends:dateField(body.ends_on)});
 if(result.error)throw result.error;return privateResponse({estimate:result.data});
 }catch(e){return apiError(e);}}
