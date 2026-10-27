import {apiError,workforceActor} from '@/lib/workforce/server';
import {uuid,WorkforceError} from '@/lib/workforce/validation';
import {renderRemoteAgreement} from '@/lib/workforce/remote-work-pdf';
import type {RemoteDetails} from '@/lib/workforce/remote-work';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const actor=await workforceActor();let query=actor.db.from('wf_employee_requests').select('employee_id,remote_details,status,decided_at,decision_reason').eq('id',uuid((await params).id)).eq('kind','remote-work');
 if(actor.role!=='admin')query=query.eq('employee_id',actor.employee!.id);
 const result=await query.maybeSingle();if(result.error)throw result.error;if(!result.data?.remote_details)throw new WorkforceError('الاتفاق غير متاح',404);
 const row=result.data,d=row.remote_details as RemoteDetails;const pdf=await renderRemoteAgreement(d.snapshot,d.signature,d.signed_at,{status:row.status,at:row.decided_at,reason:row.decision_reason});
 return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`${new URL(request.url).searchParams.get('download')==='1'?'attachment':'inline'}; filename="signed-remote-work-agreement.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return apiError(e);}}
