import {apiError,assertMutation,createServiceRoleClient,workforceActor} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {textField,WorkforceError} from '@/lib/workforce/validation';
import {parseTaskSuggestion,suggestionPrompt,suggestionSchema,type SuggestionMember} from '@/lib/workforce/task-suggestion';
import {getOpenAI,chatComplete} from '@/lib/openai';
export const runtime='nodejs';
export const maxDuration=60;
// Small per-user budget, bounded in memory; no task, notification or mail writes.
const budgets=new Map<string,{until:number;count:number;busy:boolean}>();
export async function POST(request:Request){
 let release:(()=>void)|undefined;
 try{
  await assertMutation(request);const actor=await workforceActor();
  if(Number(request.headers.get('content-length')??0)>3000)throw new WorkforceError('عنوان المهمة طويل');
  const input=await request.json();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='title'))throw new WorkforceError('أدخل عنوان المهمة فقط');
  const title=textField(input.title,'عنوان المهمة',2,250);
  if(!process.env.OPENAI_API_KEY)throw new WorkforceError('التعبئة الذكية غير متاحة حاليًا',503);
  const now=Date.now();for(const [key,value] of budgets)if(value.until<now&&!value.busy)budgets.delete(key);
  let budget=budgets.get(actor.user.id);if(!budget||(budget.until<now&&!budget.busy))budget={until:now+60000,count:0,busy:false};
  if(budget.busy||budget.count>=3||budgets.size>=1000)throw new WorkforceError('انتظر قليلًا ثم أعد المحاولة',429);
  budget.busy=true;budget.count++;budgets.set(actor.user.id,budget);release=()=>{budget!.busy=false;};
  let members:SuggestionMember[]=[];
  if(actor.canManageTasks){
   const service=await createServiceRoleClient();
   const staff=await service.from('wf_employees').select('id,full_name,job_title').eq('status','active').limit(100);
   const admins=await service.from('wf_task_assignment_admins').select('user_id,display_name,profile:profiles!inner(role)').eq('profile.role','admin');
   if(staff.error)throw staff.error;if(admins.error)throw admins.error;
   members=[...(staff.data??[]).map(e=>({id:e.id,name:e.full_name,job_title:e.job_title})),...(admins.data??[]).map(e=>({id:`admin:${e.user_id}`,name:e.display_name,job_title:'مدير الشركة'}))];
  }else if(actor.employee)members=[{id:actor.employee.id,name:actor.employee.full_name,job_title:actor.employee.job_title}];
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
  try{
   const completion=await chatComplete(getOpenAI(),{model:process.env.OPENAI_TASK_MODEL||'gpt-5.5',messages:suggestionPrompt(title,members,today),response_format:{type:'json_schema',json_schema:{name:'task_draft',strict:true,schema:suggestionSchema}},max_completion_tokens:2400,reasoning_effort:'low',store:false},{retries:0,timeoutMs:45000});
   const choice=completion.choices[0];if(choice?.finish_reason!=='stop'||choice.message.refusal||!choice.message.content)throw new Error('Incomplete suggestion');
   return privateResponse(parseTaskSuggestion(JSON.parse(choice.message.content),members,today));
  }catch{throw new WorkforceError('تعذرت التعبئة الذكية؛ حاول مرة أخرى أو أكمل الحقول يدويًا',503);}
 }catch(error){return apiError(error);}finally{release?.();}
}
