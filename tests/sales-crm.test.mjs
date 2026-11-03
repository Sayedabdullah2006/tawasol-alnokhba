import test from 'node:test';import assert from 'node:assert/strict';
import {createSalesDB,command,snapshot,ids} from './helpers/sales-db.mjs';
import {defaultSalesPlan,evaluateSales,validateSalesPlan,scopeSalesData} from '../src/lib/workforce/sales.ts';
const month='2026-11';
async function prepared(){const db=await createSalesDB();await command(db,'create_month',{closing_employee_id:ids.ne});for(const id of [ids.ne,ids.me])await command(db,'save_plan',{employee_id:id,...defaultSalesPlan(month,id===ids.ne),reason:'خطة نوفمبر المعتمدة'});return db;}
test('plan weights are checked and competition is capped; excluded goals are not zeros',()=>{
 const p={id:'plan',month,employee_id:ids.ne,...defaultSalesPlan(month,true)};assert.doesNotThrow(()=>validateSalesPlan(p));p.goals[0].weight=99;assert.throws(()=>validateSalesPlan(p));p.goals[0].weight=10;
 const activities=Array.from({length:40},(_,i)=>({id:String(i),employee_id:ids.ne,month,metric:'prospect',account_id:String(i),occurred_on:'2026-11-04',status:'approved'}));
 assert.equal(evaluateSales(p,activities).goals[0].score,100);p.goals[0].excluded=true;assert.equal(evaluateSales(p,activities).goals[0].score,null);
});
test('installments in later months never count as another closed sale, while collections stay in their actual month',()=>{
 const facts=[{id:'contract',employee_id:ids.ne,opportunity_id:'deal',metric:'contract',amount:1000,status:'approved',month:'2026-11',occurred_on:'2026-11-04'},
 {id:'first',employee_id:ids.ne,opportunity_id:'deal',metric:'collection',amount:400,status:'approved',month:'2026-11',occurred_on:'2026-11-04'},
 {id:'second',employee_id:ids.ne,opportunity_id:'deal',metric:'collection',amount:600,status:'approved',month:'2026-12',occurred_on:'2026-12-04'}];
 const nov={id:'n',employee_id:ids.ne,month:'2026-11',...defaultSalesPlan('2026-11',true)},dec={...nov,month:'2026-12'};
 assert.equal(evaluateSales(nov,facts).goals.find(g=>g.metric==='closed').actual,1);assert.equal(evaluateSales(dec,facts).goals.find(g=>g.metric==='closed').actual,0);
 const raw={admin:true,employeeId:null,month:{month:'2026-12-01'},plans:[dec],activities:facts,_competitionFacts:facts};assert.equal(scopeSalesData(raw).teamWon,0);
 const cash={...dec,goals:[{key:'cash',title:'التحصيل',metric:'collection',target:1000,weight:100,group:'role',excluded:false}]};assert.equal(evaluateSales(cash,facts).goals[0].actual,600);
});
test('roles, draft privacy, monthly revisions, idempotency and weekly task linking',async()=>{
 const db=await prepared();try{
 assert.equal((await snapshot(db,ids.monwa)).plans.length,0);await assert.rejects(command(db,'publish',{},ids.client));await assert.rejects(command(db,'publish',{},ids.monwa));
 const key=crypto.randomUUID();const v=(await snapshot(db)).month.version;await command(db,'publish',{},ids.admin,month,key,v);await command(db,'publish',{},ids.admin,month,key,v);
 assert.equal((await snapshot(db)).tasks.length,8);await command(db,'publish',{});assert.equal((await snapshot(db)).tasks.length,8);
 await assert.rejects(command(db,'settings',{closing_employee_id:ids.ne,team_target:2,reason:'تعديل'},ids.admin,month,crypto.randomUUID(),v),/تغيرت/);
 await db.exec('reset role; set role authenticated');await assert.rejects(db.query('select wf_sales_snapshot($1,$2)',[ids.admin,month+'-01']),/permission denied/);await assert.rejects(db.query('select * from wf_sales_plans'),/permission denied/);
 }finally{await db.close();}
});
test('CRM attribution, approved evidence, closer permissions, money integrity, final review and month freeze',async()=>{
 const db=await prepared();try{
 await command(db,'publish',{});const account=crypto.randomUUID(),opp=crypto.randomUUID();
 await command(db,'account_create',{id:account,name:'شركة الاختبار',name_key:'test',contact_name:'المسؤول',email:'test@example.com',phone:'',website:'',fit_reason:'تحتاج موقعًا'},ids.monwa);
 const createOpp={id:opp,account_id:account,title:'موقع للشركة',service:'موقع',value:10000,need:'موقع جديد',decision_maker:'المدير',purchase_timing:'هذا الشهر',next_action:'تحديد لقاء',next_on:'2026-11-10',stage:'qualified'};
 await command(db,'opportunity_create',createOpp,ids.monwa);assert.equal((await snapshot(db)).opportunities[0].source_employee_id,ids.me);
 const activity=(metric,amount=0)=>({employee_id:ids.ne,account_id:account,opportunity_id:opp,metric,occurred_on:'2026-11-04',summary:'إنجاز موثق للاختبار',reference:metric+'-01',evidence_url:'https://example.com/evidence',amount});
 await assert.rejects(command(db,'activity',activity('quote',10000),ids.monwa),/مسؤولة/);
 await command(db,'activity',activity('qualified'),ids.monwa);let s=await snapshot(db);assert.equal(evaluateSales(s.plans.find(p=>p.employee_id===ids.me),s.activities).goals.find(g=>g.metric==='qualified').actual,0);
 for(const a of s.activities)await command(db,'approve_activity',{id:a.id,status:'approved',reason:'تحقق الدليل'});
 s=await snapshot(db);assert.equal(evaluateSales(s.plans.find(p=>p.employee_id===ids.me),s.activities).goals.find(g=>g.metric==='qualified').actual,1);
 await command(db,'activity',activity('collection',1000),ids.noor);s=await snapshot(db);let pay=s.activities.find(a=>a.metric==='collection');await assert.rejects(command(db,'approve_activity',{id:pay.id,status:'approved',reason:'تحقق الدليل'}),/عقد/);
 await command(db,'activity',activity('contract',10000),ids.noor);s=await snapshot(db);const contract=s.activities.find(a=>a.metric==='contract');await command(db,'approve_activity',{id:contract.id,status:'approved',reason:'عقد موقع'});await command(db,'approve_activity',{id:pay.id,status:'approved',reason:'دفعة موثقة'});
 s=await snapshot(db);assert.equal(s.opportunities[0].stage,'won');assert.equal(evaluateSales(s.plans.find(p=>p.employee_id===ids.ne),s.activities).goals.find(g=>g.metric==='closed').actual,1);
 await command(db,'self_review',{self_note:'أحتاج دعمًا في الاستقطاب'},ids.monwa);assert.equal((await snapshot(db,ids.noor)).reviews.length,0);
 for(const p of s.plans)await command(db,'review',{employee_id:p.employee_id,manager_note:'تقييم موثق',development:'تطوير التأهيل',snapshot:evaluateSales(p,s.activities),reason:'اعتماد التقييم'});
 assert.equal((await snapshot(db,ids.monwa)).reviews.length,1);await command(db,'close',{});await assert.rejects(command(db,'activity',activity('meeting'),ids.noor),/مغلق/);await command(db,'reopen',{reason:'تصحيح موثق'});assert.equal((await snapshot(db)).reviews.filter(r=>r.status==='published').length,0);
 }finally{await db.close();}
});
test('weekly tasks use the existing real task command and preserve assignee and approval workflow',async()=>{
 const {createPerformanceDB,ids:existing}=await import('./helpers/performance-db.mjs');
 const {readFile}=await import('node:fs/promises');const db=await createPerformanceDB();
 try{await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261103212605_monthly_sales_crm.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261103222721_overall_sales_task_performance.sql',import.meta.url),'utf8'));await db.exec('set role service_role');
 await command(db,'create_month',{closing_employee_id:existing.ne},existing.admin);
 await command(db,'save_plan',{employee_id:existing.ne,...defaultSalesPlan(month,true),reason:'خطة متكاملة'},existing.admin);
 await command(db,'publish',{},existing.admin);const s=await snapshot(db,existing.admin);assert.equal(s.tasks.length,4);
 const tasks=(await db.query('select assignee_id,requires_approval,starts_at from public.wf_tasks where id in (select task_id from public.wf_sales_task_links)')).rows;
 assert.ok(tasks.every(t=>t.assignee_id===existing.ne&&t.requires_approval&&t.starts_at));const configs=(await db.query('select size,configured_at from wf_performance_assignments where task_id in (select task_id from wf_sales_task_links)')).rows;assert.equal(configs.length,4);assert.ok(configs.every(x=>x.size&&x.configured_at));
 }finally{await db.close();}
});
test('sales manager sees all CRM; sellers see their own pipeline, cannot enter closing stages, and shared board contains no private evidence',async()=>{
 const db=await prepared();try{
 await command(db,'publish',{});const rows=[];
 for(const actor of [ids.noor,ids.monwa]){const id=crypto.randomUUID(),op=crypto.randomUUID();await command(db,'account_create',{id,name:actor===ids.noor?'جهة نور':'جهة منوه',name_key:actor,email:actor+'@example.com',contact_name:'مسؤول',phone:'',website:'',fit_reason:'فرصة مناسبة'},actor);
 const payload={id:op,account_id:id,title:'فرصة اختبار',service:'موقع',value:1000,need:'موقع جديد',decision_maker:'المدير',purchase_timing:'نوفمبر',next_action:'إحالة للاجتماع',next_on:'2026-11-10',stage:'contacted'};await command(db,'opportunity_create',payload,actor);rows.push(payload);}
 assert.equal((await snapshot(db,ids.noor)).opportunities.length,2);assert.equal((await snapshot(db,ids.monwa)).opportunities.length,1);
 await assert.rejects(command(db,'opportunity_edit',{...rows[0],reason:'تعديل غير مصرح'},ids.monwa),/غير متاحة/);
 await assert.rejects(command(db,'opportunity_edit',{...rows[1],stage:'proposal',reason:'محاولة إغلاق'},ids.monwa),/مسؤولة/);
 await command(db,'opportunity_edit',{...rows[1],stage:'qualified',reason:'إحالة إلى مديرة المبيعات'},ids.monwa);
 let s=await snapshot(db,ids.noor);assert.equal(s.opportunities.find(o=>o.id===rows[1].id).followup_employee_id,ids.ne);
 await assert.rejects(command(db,'opportunity_edit',{...rows[1],stage:'proposal',reason:'تجهيز العرض'},ids.noor),/عرض سعر معتمد/);
 await command(db,'activity',{employee_id:ids.ne,account_id:rows[1].account_id,opportunity_id:rows[1].id,metric:'quote',occurred_on:'2026-11-04',summary:'عرض السعر للعميل',details:'النطاق والمخرجات وشروط الدفع',reference:'Q-TEST',amount:1000},ids.noor);
 const quote=(await snapshot(db)).activities.find(a=>a.metric==='quote');await command(db,'approve_activity',{id:quote.id,status:'approved',reason:'عرض سعر معتمد'});
 s=await snapshot(db,ids.monwa);assert.equal(s.opportunities[0].source_employee_id,ids.me);assert.equal(s.opportunities[0].stage,'proposal');
 const safe=scopeSalesData(s);assert.equal(safe.plans.length,1);assert.equal(safe.tasks.length,4);assert.ok(safe.tasks.every(t=>t.plan_id===safe.plans[0].id));assert.equal(safe.competition.length,2);assert.equal('_competitionFacts' in safe,false);assert.ok(!JSON.stringify(safe.activities).includes(rows[0].id));
 }finally{await db.close();}
});

test('opportunity files follow source and manager access, bind evidence, preserve audit and separate signed sales from paid targets',async()=>{
 const db=await prepared();try{
 await command(db,'publish',{});const opportunities=[];
 for(const actor of [ids.monwa,ids.noor]){
  const account=crypto.randomUUID(),id=crypto.randomUUID();await command(db,'account_create',{id:account,name:actor,name_key:actor,email:actor+'@test.invalid',contact_name:'مسؤول',phone:'',website:'',fit_reason:'ملاءمة للاختبار'},actor);
  await command(db,'opportunity_create',{id,account_id:account,title:'فرصة مستندات',service:'موقع',value:1000,need:'موقع جديد',decision_maker:'المدير',purchase_timing:'نوفمبر',next_action:'تحديد لقاء',next_on:'2026-11-10',stage:'qualified'},actor);opportunities.push({id,account});
 }
 const [own,other]=opportunities,id=crypto.randomUUID(),payload={filename:'عقد.pdf',mime_type:'application/pdf',size_bytes:100,sha256:'a'.repeat(64),purpose:'contract',object_path:own.id+'/'+crypto.randomUUID()};
 const fileCommand=async(actor,opp,cmd,fileId=null,p={})=>(await db.query('select wf_sales_file_command($1,$2,$3,$4,$5) data',[actor,opp,cmd,fileId,p])).rows[0].data;
 await fileCommand(ids.monwa,own.id,'add',id,payload);await fileCommand(ids.monwa,own.id,'add',id,{...payload,object_path:own.id+'/'+crypto.randomUUID()});
 assert.equal((await fileCommand(ids.noor,own.id,'list')).files.length,1);assert.equal((await fileCommand(ids.monwa,own.id,'list')).files[0].object_path,undefined);
 await assert.rejects(fileCommand(ids.monwa,other.id,'list'),/غير متاحة/);await assert.rejects(fileCommand(ids.monwa,other.id,'download',id),/غير متاحة/);
 await assert.rejects(fileCommand(ids.monwa,own.id,'add',id,{...payload,sha256:'b'.repeat(64)}),/مفتاح/);
 await assert.rejects(fileCommand(ids.noor,other.id,'download',id),/المرفق غير متاح/);
 const activity={employee_id:ids.ne,opportunity_id:own.id,account_id:own.account,metric:'contract',occurred_on:'2026-11-04',summary:'العقد الموقع من العميل',reference:'SIGNED-FILE',amount:1000,evidence_attachment_id:id,evidence_url:''};
 await assert.rejects(command(db,'activity',{...activity,opportunity_id:other.id,account_id:other.account},ids.noor),/الفرصة نفسها/);
 await assert.rejects(command(db,'activity',activity,ids.monwa),/مسؤولة/);await command(db,'activity',activity,ids.noor);
 await assert.rejects(fileCommand(ids.monwa,own.id,'archive',id),/مرتبط/);
 const signed=(await snapshot(db)).activities.find(a=>a.reference==='SIGNED-FILE');await command(db,'approve_activity',{id:signed.id,status:'approved',reason:'الملف عقد موقع'});
 let s=await snapshot(db);assert.equal(s.opportunities.find(o=>o.id===own.id).stage,'won');assert.equal(evaluateSales(s.plans.find(p=>p.employee_id===ids.ne),s.activities).goals.find(g=>g.metric==='closed').actual,0);
 await command(db,'activity',{...activity,metric:'collection',reference:'PAY-FILE',amount:300},ids.noor);let payment=(await snapshot(db)).activities.find(a=>a.reference==='PAY-FILE');await command(db,'approve_activity',{id:payment.id,status:'approved',reason:'دفعة موثقة'});
 s=await snapshot(db);assert.equal(evaluateSales(s.plans.find(p=>p.employee_id===ids.ne),s.activities).goals.find(g=>g.metric==='closed').actual,1);assert.equal(s.opportunities.find(o=>o.id===own.id).source_employee_id,ids.me);
 const disposable=crypto.randomUUID();await fileCommand(ids.noor,own.id,'add',disposable,{...payload,filename:'عرض.pdf',object_path:own.id+'/'+crypto.randomUUID()});await assert.rejects(fileCommand(ids.monwa,own.id,'archive',disposable),/ملفاتك/);await command(db,'activity',{...activity,metric:'quote',reference:'REJECT-FILE',details:'عرض للاختبار قبل الأرشفة',evidence_attachment_id:disposable},ids.noor);const rejected=(await snapshot(db)).activities.find(a=>a.reference==='REJECT-FILE');await command(db,'approve_activity',{id:rejected.id,status:'rejected',reason:'ملف غير معتمد'});await fileCommand(ids.admin,own.id,'archive',disposable);await assert.rejects(fileCommand(ids.noor,own.id,'download',disposable),/غير متاح/);await assert.rejects(db.query("update wf_sales_activities set status='approved' where id=$1",[rejected.id]),/مرفق الإثبات غير متاح/);
 await db.exec('reset role;set role authenticated');await assert.rejects(fileCommand(ids.monwa,own.id,'list'),/permission denied/);await assert.rejects(db.query('select * from wf_crm_files'),/permission denied/);
 }finally{await db.close();}
});
