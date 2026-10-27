import {apiError,assertMutation,createServiceRoleClient,requireAdmin,workforceActor} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {textField,uuid,WorkforceError} from '@/lib/workforce/validation';
const fields=['legal_name','unified_number','address','representative','email','phone','source'] as const;
export async function GET(){try{const actor=await workforceActor();requireAdmin(actor);const db=await createServiceRoleClient();const [company,contracts,employees]=await Promise.all([db.from('wf_remote_company').select('*').eq('id',true).maybeSingle(),db.from('wf_remote_contracts').select('*'),db.from('wf_employees').select('id,full_name').eq('status','active')]);for(const r of [company,contracts,employees])if(r.error)throw r.error;return privateResponse({company:company.data,contracts:contracts.data,employees:employees.data});}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();requireAdmin(actor);const raw=await request.json();
 const company=Object.fromEntries(fields.map(k=>[k,textField(raw.company?.[k],k,3,k==='address'?500:200)]));
 if(!/^\d{10}$/.test(company.unified_number)||!/^\S+@\S+\.\S+$/.test(company.email))throw new WorkforceError('راجع رقم المنشأة والبريد الإلكتروني');
 if(!Array.isArray(raw.contracts)||raw.contracts.length>100)throw new WorkforceError('بيانات العقود غير صحيحة');
 const contracts=raw.contracts.map((v:{employee_id:string;contract_number:string;source:string})=>({employee_id:uuid(v.employee_id),contract_number:textField(v.contract_number,'رقم العقد',1,100),source:textField(v.source,'مرجع العقد',3,200)}));
 const result=await(await createServiceRoleClient()).rpc('wf_remote_metadata',{p_actor:actor.user.id,p_company:company,p_contracts:contracts});if(result.error)throw result.error;return privateResponse({saved:true});
}catch(e){return apiError(e);}}
