import {apiError,assertMutation,createServiceRoleClient,requireAdmin,workforceActor} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {dateField,textField,uuid,WorkforceError} from '@/lib/workforce/validation';
import {evaluateSales,numberField,riyadhToday,safeSalesUrl,salesMetrics,salesMonth,salesStages,validateSalesPlan} from '@/lib/workforce/sales';
import {salesSnapshot} from '@/lib/workforce/sales-server';
export async function GET(request:Request){try{const actor=await workforceActor();return privateResponse(await salesSnapshot(actor,salesMonth(new URL(request.url).searchParams.get('month')??riyadhToday().slice(0,7))));}catch(error){return apiError(error);}}
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();const raw=await request.text();if(raw.length>150000)throw new WorkforceError('الطلب كبير جدًا');
 const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new WorkforceError('صيغة الطلب غير صحيحة');
 const month=salesMonth(body.month),command=textField(body.command,'الإجراء',1,40),key=uuid(body.request_key);
 if(!Number.isSafeInteger(body.version)||body.version<0)throw new WorkforceError('نسخة الشهر غير صحيحة');
 if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new WorkforceError('بيانات الإجراء غير صحيحة');
 const p=body.payload;let payload:Record<string,unknown>={};
 const minimumTasks=()=>{const n=numberField(p.minimum_tasks??5,'الحد الأدنى للمهام المؤهلة',100);if(!Number.isSafeInteger(n)||n<1)throw new WorkforceError('الحد الأدنى للمهام يجب أن يكون عددًا صحيحًا من 1 إلى 100');return n;};
 const reason=()=>textField(p.reason??'','سبب الإجراء',3,2000);
 const employee=()=>uuid(actor.role==='admin'?p.employee_id:actor.employee?.id);
 if(['create_month','settings','save_plan','publish','close','reopen','review','approve_activity'].includes(command))requireAdmin(actor);
 if(['create_month','settings'].includes(command))payload={closing_employee_id:uuid(p.closing_employee_id),team_target:numberField(p.team_target,'هدف الفريق',10000),performance_sales_weight:numberField(p.performance_sales_weight??60,'وزن المبيعات في التقييم الكلي',100),...(p.minimum_tasks===undefined?{}:{minimum_tasks:minimumTasks()}),note:textField(p.note??'','ملاحظات الشهر',0,4000),...(command==='settings'?{reason:reason(),manager_employee_id:uuid(p.manager_employee_id)}:{})};
 else if(command==='save_plan')payload={employee_id:uuid(p.employee_id),...validateSalesPlan(p),reason:reason()};
 else if(['publish','close'].includes(command))payload={reason:textField(p.reason??'اعتماد الخطة','السبب',3,2000)};
 else if(command==='reopen')payload={reason:reason()};
 else if(command==='self_review')payload={employee_id:employee(),self_note:textField(p.self_note??'','التقييم الذاتي',3,6000)};
 else if(command==='review'){
  const data=await salesSnapshot(actor,month);const plan=data.plans.find(p=>p.employee_id===body.payload.employee_id);if(!plan)throw new WorkforceError('الخطة غير متاحة');
  if(data.month?.version!==body.version)throw new WorkforceError('تغيرت البيانات؛ حدّث الصفحة',409);
  payload={employee_id:uuid(p.employee_id),manager_note:textField(p.manager_note,'تقييم المدير',3,6000),development:textField(p.development,'خطة التطوير',3,6000),snapshot:evaluateSales(plan,data.activities),reason:reason()};
 }else if(['account_create','account_edit'].includes(command)){
  const name=textField(p.name,'اسم الجهة',2,180),email=textField(p.email??'','البريد',0,180).toLowerCase();
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new WorkforceError('البريد غير صحيح');
  const website=safeSalesUrl(p.website);const normalized=website?new URL(website).origin.toLowerCase():'';
  const phone=textField(p.phone??'','الهاتف',0,40);if(!email&&!phone&&!website)throw new WorkforceError('أضف وسيلة تواصل واحدة على الأقل');
  payload={id:uuid(p.id),name,name_key:name.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ\s\p{P}]/gu,'').toLowerCase(),contact_name:textField(p.contact_name??'','مسؤول التواصل',0,180),email,phone,website:normalized,fit_reason:textField(p.fit_reason,'سبب الملاءمة',3,2000),owner_id:uuid((actor.role==='admin'||(await salesSnapshot(actor,month)).canManageSales)?p.owner_id:actor.employee?.id),...(command==='account_edit'?{reason:reason()}:{})};
  if(command==='account_create'&&month!==riyadhToday().slice(0,7))throw new WorkforceError('إضافة الجهات تُسجل في الشهر الحالي');
 }else if(['opportunity_create','opportunity_edit'].includes(command)){
  if(!Object.hasOwn(salesStages,p.stage??'target'))throw new WorkforceError('مرحلة غير صحيحة');
  payload={id:uuid(p.id),account_id:uuid(p.account_id),title:textField(p.title,'عنوان الفرصة',2,180),service:textField(p.service,'الخدمة',2,180),stage:p.stage??'target',value:numberField(p.value??0,'القيمة المتوقعة'),need:textField(p.need??'','الاحتياج',0,4000),decision_maker:textField(p.decision_maker??'','صاحب القرار',0,1000),purchase_timing:textField(p.purchase_timing??'','توقيت الشراء',0,1000),next_action:textField(p.next_action,'الخطوة التالية',3,2000),next_on:dateField(p.next_on,true),loss_reason:textField(p.loss_reason??'','سبب الخسارة',0,2000),request_id:p.request_id?uuid(p.request_id):null,followup_employee_id:p.followup_employee_id?uuid(p.followup_employee_id):null,...(command==='opportunity_edit'?{reason:reason()}:{})};
 }else if(command==='activity'){
  const metric=textField(p.metric,'المؤشر',1,60);if(!Object.hasOwn(salesMetrics,metric))throw new WorkforceError('نوع الإنجاز غير صحيح');
  payload={employee_id:employee(),account_id:p.account_id?uuid(p.account_id):null,opportunity_id:p.opportunity_id?uuid(p.opportunity_id):null,metric,goal_key:textField(p.goal_key??'','رمز الهدف',0,60),occurred_on:dateField(p.occurred_on),summary:textField(p.summary,'ملخص الإنجاز',5,4000),evidence_url:safeSalesUrl(p.evidence_url),evidence_attachment_id:p.evidence_attachment_id?uuid(p.evidence_attachment_id):null,reference:textField(p.reference??'','رقم المرجع',0,180),amount:numberField(p.amount??0,'المبلغ'),details:textField(p.details??'','تفاصيل العرض أو الاتفاق',0,10000)};
 }else if(command==='approve_activity'){
  if(!['approved','rejected'].includes(p.status))throw new WorkforceError('قرار غير صحيح');payload={id:uuid(p.id),status:p.status,reason:reason()};
 }else throw new WorkforceError('الإجراء غير معروف');
 const service=await createServiceRoleClient();const {data,error}=await service.rpc('wf_sales_command',{p_actor:actor.user.id,p_month:month+'-01',p_version:body.version,p_command:command,p_payload:payload,p_key:key});if(error)throw error;
 return privateResponse(data);
}catch(error){return apiError(error);}}
