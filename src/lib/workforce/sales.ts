import { dateField, textField, uuid, WorkforceError } from './validation';

export const salesMetrics: Record<string,string> = {
 prospect:'جهات مستهدفة',contact:'تواصل أولي',followup:'متابعات تجارية',qualified:'فرص مؤهلة',
 recordkeeping:'تحديث سجل الفرص',meeting:'لقاءات منعقدة',quote:'عروض أسعار',closed:'صفقات مدفوعة',
 contract:'عقود موقعة',collection:'تحصيل بالريال',service_card:'بطاقات خدمات',technical_study:'دراسات فنية',
 technical_quote:'عروض فنية',demo:'نموذج توضيحي',responsiveness:'استجابة فنية',manual:'إنجاز مخصص',
};
export const salesStages: Record<string,string> = {target:'مستهدفة',contacted:'تم التواصل',qualified:'مؤهلة',meeting:'لقاء',proposal:'عرض سعر',negotiation:'تفاوض',contracting:'التعاقد والتوقيع',contract:'عقد موقع',won:'فوز وتحصيل',lost:'خسارة',paused:'مؤجلة'};
export type SalesGoal={key:string;title:string;metric:string;target:number;weight:number;group:'competition'|'role';unit:string;excluded:boolean;exclusion_reason:string};
export type SalesWeek={key:string;title:string;details:string;due_on:string};
export type SalesPlan={id:string;month:string;employee_id:string;competition_weight:number;goals:SalesGoal[];weekly:SalesWeek[]};
export type SalesMonth={month:string;status:'draft'|'published'|'closed';version:number;closing_employee_id:string;team_target:number;note:string};
export type SalesAccount={id:string;name:string;contact_name:string;email:string;phone:string;website:string;fit_reason:string;owner_id:string;created_at:string};
export type SalesOpportunity={id:string;account_id:string;title:string;service:string;source_employee_id:string;closing_employee_id:string;followup_employee_id:string;stage:string;value:number;need:string;decision_maker:string;purchase_timing:string;next_action:string;next_on:string|null;loss_reason:string;request_id:string|null;created_at:string};
export type SalesActivity={id:string;month:string;employee_id:string;account_id:string|null;opportunity_id:string|null;metric:string;goal_key:string;occurred_on:string;summary:string;evidence_url:string;reference:string;amount:number;details:string;status:'pending'|'approved'|'rejected';decision_note:string;created_at:string};
export type SalesReview={employee_id:string;month:string;self_note:string;manager_note:string;status:'draft'|'published';snapshot:SalesEvaluation|null;development:string};
export type SalesTaskLink={plan_id:string;week_key:string;task_id:string;title:string;due_at:string;kind:string};
export type SalesAudit={id:number;action:string;reason:string;created_at:string;before_data:unknown;after_data:unknown};
export type SalesData={canManageSales?:boolean;managerEmployeeId?:string;teamWon?:number;competition?:{employee_id:string;score:number|null;goals:GoalResult[]}[];selfNote?:string;admin:boolean;employeeId:string|null;month:SalesMonth|null;months:{month:string;status:string}[];employees:{id:string;full_name:string}[];plans:SalesPlan[];accounts:SalesAccount[];opportunities:SalesOpportunity[];activities:SalesActivity[];reviews:SalesReview[];tasks:SalesTaskLink[];audit:SalesAudit[]};
export type GoalResult=SalesGoal&{actual:number;pending:number;score:number|null};
export type SalesEvaluation={goals:GoalResult[];competition:number|null;role:number|null;total:number|null;rating:string;unrated:number};
export function salesMonth(value:unknown){const month=textField(value,'الشهر',7,7);if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new WorkforceError('الشهر غير صحيح');return month;}
export const riyadhToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function numberField(value:unknown,label:string,max=100000000){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw new WorkforceError(`${label}: رقم غير صحيح`);return value;}
export function safeSalesUrl(value:unknown){const raw=textField(value??'','رابط الإثبات',0,1500);if(!raw)return '';try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();return u.href;}catch{throw new WorkforceError('أدخل رابطًا يبدأ بـ https:// أو http://');}}
export function validateSalesPlan(value:unknown):Pick<SalesPlan,'goals'|'weekly'|'competition_weight'>{
 if(!value||typeof value!=='object')throw new WorkforceError('الخطة غير صحيحة');const p=value as Record<string,unknown>;
 const competition_weight=numberField(p.competition_weight,'وزن التنافس',100);
 if(!Array.isArray(p.goals)||!p.goals.length||p.goals.length>30)throw new WorkforceError('أضف من هدف إلى 30 هدفًا');
 const keys=new Set<string>();const goals=p.goals.map((item:unknown)=>{
  if(!item||typeof item!=='object')throw new WorkforceError('الهدف غير صحيح');const g=item as SalesGoal;
  const key=textField(g.key,'رمز الهدف',1,60);if(!/^[a-z0-9_-]+$/.test(key)||keys.has(key))throw new WorkforceError('رمز الهدف مكرر أو غير صحيح');keys.add(key);
  if(!Object.hasOwn(salesMetrics,g.metric)||!['competition','role'].includes(g.group))throw new WorkforceError('نوع الهدف غير صحيح');
  const target=numberField(g.target,'المستهدف');if(target<=0)throw new WorkforceError('المستهدف يجب أن يتجاوز صفرًا؛ استخدم استبعاد الهدف عند التعذر');
  const exclusion_reason=textField(g.exclusion_reason??'','سبب الاستبعاد',0,1000);if(g.excluded&&exclusion_reason.length<3)throw new WorkforceError('وضح سبب استبعاد الهدف');
  return {key,title:textField(g.title,'عنوان الهدف',2,180),metric:g.metric,target,weight:numberField(g.weight,'الوزن',100),group:g.group,unit:textField(g.unit??'عدد','الوحدة',1,30),excluded:!!g.excluded,exclusion_reason} as SalesGoal;
 });
 for(const group of ['competition','role']){const sum=goals.filter(g=>g.group===group).reduce((s,g)=>s+g.weight,0);if(Math.abs(sum-100)>0.001)throw new WorkforceError(`مجموع أوزان ${group==='competition'?'التنافس':'المسؤوليات الإضافية'} يجب أن يساوي 100%`);}
 if(!Array.isArray(p.weekly)||p.weekly.length>12)throw new WorkforceError('المهام الأسبوعية غير صحيحة');
 const weekKeys=new Set<string>();const weekly=p.weekly.map((w:SalesWeek)=>{const key=textField(w.key,'رمز الأسبوع',1,40);if(weekKeys.has(key))throw new WorkforceError('رمز المهمة مكرر');weekKeys.add(key);return{key,title:textField(w.title,'المهمة',2,180),details:textField(w.details,'تفاصيل المهمة',3,6000),due_on:dateField(w.due_on)!};});
 return {competition_weight,goals,weekly};
}
/** An installment is revenue in its own month, but never a second closed sale. */
export function firstPaidSales(activities:SalesActivity[],status='approved'){
 const contracts=new Set(activities.filter(a=>a.metric==='contract'&&a.status==='approved').map(a=>a.opportunity_id));
 const paid=new Set(activities.filter(a=>a.metric==='collection'&&a.status==='approved'&&Number(a.amount)>0).map(a=>a.opportunity_id));
 const first=new Map<string,SalesActivity>();
 for(const a of activities.filter(a=>a.metric==='collection'&&a.status===status&&Number(a.amount)>0&&a.opportunity_id&&contracts.has(a.opportunity_id)&&(status==='approved'||!paid.has(a.opportunity_id)))){
  const id=a.opportunity_id!;const before=first.get(id);if(!before||a.occurred_on<before.occurred_on||(a.occurred_on===before.occurred_on&&a.id<before.id))first.set(id,a);
 }
 return [...first.values()];
}
function countMetric(g:SalesGoal,employee:string,month:string,activities:SalesActivity[],status:string){
 const rows=activities.filter(a=>a.employee_id===employee&&a.month.slice(0,7)===month&&a.status===status&&(g.metric==='manual'?a.metric==='manual'&&a.goal_key===g.key:a.metric===g.metric));
 if(g.metric==='closed'){
  return firstPaidSales(activities,status).filter(a=>a.employee_id===employee&&a.month.slice(0,7)===month).length;
 }
 if(g.metric==='collection')return Math.round(rows.reduce((s,a)=>s+Number(a.amount),0)*100)/100;
 const week=(date:string)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);};
 return new Set(rows.map(a=>{
  if(['prospect','contact'].includes(g.metric))return a.account_id||a.id;
  if(g.metric==='followup')return `${a.account_id}:${week(a.occurred_on)}`;
  if(['qualified','quote','technical_study','technical_quote'].includes(g.metric))return a.opportunity_id||a.id;
  if(['recordkeeping','responsiveness'].includes(g.metric))return week(a.occurred_on);
  return a.id;
 })).size;
}
export function evaluateSales(plan:SalesPlan,activities:SalesActivity[]):SalesEvaluation{
 const goals=plan.goals.map(g=>{const actual=countMetric(g,plan.employee_id,plan.month.slice(0,7),activities,'approved'),pending=countMetric(g,plan.employee_id,plan.month.slice(0,7),activities,'pending');return{...g,actual,pending,score:g.excluded?null:Math.min(actual/g.target,1)*100};});
 const group=(name:string)=>{const list=goals.filter(g=>g.group===name&&g.score!==null&&g.weight>0);const weights=list.reduce((s,g)=>s+g.weight,0);return weights?list.reduce((s,g)=>s+g.score!*g.weight,0)/weights:null;};
 const competition=group('competition'),role=group('role');let total:number|null=null;
 const weights=(competition===null?0:plan.competition_weight)+(role===null?0:100-plan.competition_weight);
 if(weights)total=Math.round(((competition??0)*plan.competition_weight+(role??0)*(100-plan.competition_weight))/weights*10)/10;
 return{goals,competition,role,total,rating:total===null?'غير مقيم':total<50?'ضعيف':total<70?'يحتاج إلى تحسين':total<90?'مرضي':total<100?'جيد جدًا':'تحققت المستهدفات',unrated:goals.filter(g=>g.excluded).length};
}
const goal=(key:string,title:string,metric:string,target:number,weight:number,group:'competition'|'role'):SalesGoal=>({key,title,metric,target,weight,group,unit:'عدد',excluded:false,exclusion_reason:''});
export function defaultSalesPlan(month:string,closer:boolean){
 const goals=[goal('prospects','إضافة جهات مناسبة','prospect',15,10,'competition'),goal('contacts','التواصل الأولي','contact',10,20,'competition'),goal('followups','المتابعات التجارية','followup',6,20,'competition'),goal('qualified','تأهيل فرص جادة','qualified',2,40,'competition'),goal('records','تحديث السجل أسبوعيًا','recordkeeping',4,10,'competition'),
 ...(closer?[goal('meetings','عقد لقاءات الاحتياج','meeting',3,30,'role'),goal('quotes','تقديم عروض معتمدة','quote',2,30,'role'),goal('closed','إغلاق صفقة مدفوعة','closed',1,30,'role'),goal('closing-followup','متابعة العروض أسبوعيًا','recordkeeping',4,10,'role')]:[goal('cards','تجهيز بطاقتي خدمة','service_card',2,20,'role'),goal('studies','دراسة الفرص التقنية','technical_study',2,25,'role'),goal('technical-quotes','تجهيز العروض الفنية','technical_quote',2,25,'role'),goal('demo','نموذج توضيحي للبيع','demo',1,15,'role'),goal('response','استجابة فنية أسبوعية','responsiveness',4,15,'role')])];
 const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate();
 const details=['إضافة 5 جهات والتواصل مع 3. '+(closer?'مراجعة الفرص الحالية وتجهيز قوالب التأهيل والعرض.':'مراجعة واعتماد بطاقتي خدمة.'),'إضافة 5 جهات والتواصل مع 3، ومتابعتان وتأهيل فرصة. '+(closer?'عقد أول لقاء وتجهيز أول عرض.':'دراسة الفرصة الأولى وتجهيز النموذج التوضيحي.'),'إضافة 5 جهات والتواصل مع 4، ومتابعتان وتأهيل الفرصة الثانية. '+(closer?'عقد اللقاءين المتبقيين وتجهيز العرض الثاني.':'دراسة الفرصة الثانية وتجهيز العرض الفني الأول.'),'متابعتان واستكمال السجل وترحيل الفرص المفتوحة. '+(closer?'متابعة القرار والتوقيع والتحصيل للصفقة المستهدفة.':'تجهيز العرض الفني الثاني ومعالجة الاستفسارات وتجهيز بدء التنفيذ.')];
 const weekly=details.map((details,i)=>({key:`week-${i+1}`,title:`مبيعات ${month} — الأسبوع ${i+1}`,details:details+' توثيق الأنشطة والإثبات في CRM؛ اعتماد المهمة لا يمنح نقاط بيع تلقائيًا.',due_on:`${month}-${String([7,14,21,last][i]).padStart(2,'0')}`}));
 return{competition_weight:60,goals,weekly};
}
export function checkedEmployee(value:unknown){return uuid(value);}

/** Strip private evidence before returning the shared competition board to a browser. */
export function scopeSalesData(raw:SalesData&{_competitionFacts?:SalesActivity[]}):SalesData{
 const competition=raw.plans.map(p=>{const e=evaluateSales(p,raw._competitionFacts??raw.activities);return{employee_id:p.employee_id,score:e.competition,goals:e.goals.filter(g=>g.group==='competition')};});
 const {_competitionFacts:privateFacts,...safe}=raw;void privateFacts;
 const facts=raw._competitionFacts??raw.activities;const month=raw.month?.month.slice(0,7);
 const teamWon=firstPaidSales(facts).filter(a=>a.month.slice(0,7)===month).length;
 return{...safe,competition,teamWon,plans:raw.admin?safe.plans:safe.plans.filter(p=>p.employee_id===raw.employeeId)};
}
