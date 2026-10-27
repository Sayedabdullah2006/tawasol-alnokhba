import {assertMutation,workforceActor,createServiceRoleClient,apiError} from '@/lib/workforce/server';
import {remoteInput,remoteSignature} from '@/lib/workforce/remote-work';
import {renderRemoteAgreement} from '@/lib/workforce/remote-work-pdf';
import {WorkforceError} from '@/lib/workforce/validation';
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();if(!actor.employee)throw new WorkforceError('الاتفاق للموظفة صاحبة الطلب فقط',403);
 const body=await request.json();const result=await(await createServiceRoleClient()).rpc('wf_remote_work_quote',{p_actor:actor.user.id,p_payload:remoteInput(body.input)});if(result.error)throw result.error;
 if(result.data.hash!==body.hash)throw new WorkforceError('تغيرت نسخة الاتفاق؛ حدّثي التقدير أولًا',409);
 const pdf=await renderRemoteAgreement(result.data,body.signature?remoteSignature(body.signature):[]);
 return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="remote-work-agreement.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return apiError(e);}}
