import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8')),base=process.env.WORKFORCE_TEST_URL||'http://localhost:3102';assertWorkforceTestTarget(base);
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),checks=[],ids=[],label=`QA employee tools ${Date.now()}`;
async function session(account){const jar=new Map(),db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:account.email,password:state.password})).error);return{db,request:(path,body,method='POST')=>fetch(base+path,{method:body?method:'GET',headers:{Origin:base,Cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; '),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})};}
const admin=await session(state.accounts.admin),owner=await session(state.accounts.a),peer=await session(state.accounts.b);
const staff=await service.from('wf_employees').select('id,user_id,email').in('user_id',[state.accounts.a.id,state.accounts.b.id]);assert.ifError(staff.error);const employee=staff.data.find(row=>row.user_id===state.accounts.a.id),other=staff.data.find(row=>row.user_id===state.accounts.b.id);assert(employee&&other);
async function ok(response){const data=await response.json();assert(response.ok,`${response.status}: ${JSON.stringify(data)}`);return data;}
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
const cmd=(actor,id,command,payload,version=null,scope='tasks')=>actor.request(`/api/workforce/${scope}`,{id,command,payload,version,request_key:crypto.randomUUID()});
const payrollId=crypto.randomUUID(),month='2089-'+String(new Date().getUTCMonth()+1).padStart(2,'0'),path=`/api/workforce/employees/${employee.id}/payroll`;
const payload={basic_amount:'2800.67',allowances_amount:'200',items:[],deductions:[{title:'التأمينات الاجتماعية',kind:'insurance',amount:'100.07',reference:label},{title:'حسم اختباري آخر',kind:'other',amount:'5.20',reference:label}],notes:'QA fictitious statement, no money sent',reason:label};
const save=(actor,data=payload,version=0)=>actor.request(path,{id:payrollId,month,version,command:'save',payload:data,request_key:crypto.randomUUID()});
try {
 await check('deductions: exact gross, insurance and other deductions produce net pay; owner sees own only',async()=>{
  await ok(await save(admin));const data=await ok(await owner.request(path+'?month='+month));assert.equal(data.statement.gross_amount,'3000.67');assert.equal(data.statement.deductions_amount,'105.27');assert.equal(data.statement.total_amount,'2895.4');assert.equal(data.statement.deductions.length,2);
  assert.equal((await peer.request(path+'?month='+month)).status,404);assert.equal((await save(owner)).status,403);
 });
 await check('deductions: negative, excess, forged net and unsupported fields rejected; approved snapshot frozen',async()=>{
  const s=(await ok(await admin.request(path+'?month='+month))).statement;
  for(const data of [{...payload,deductions:[{...payload.deductions[0],amount:'-1'}]},{...payload,deductions:[{...payload.deductions[0],amount:'99999'}]},{...payload,total_amount:'1'},{...payload,deductions:[{...payload.deductions[0],computed:'1'}]}])assert.equal((await save(admin,data,s.version)).status,400);
  await ok(await admin.request(path,{id:payrollId,month,version:s.version,command:'approve',payload:{reason:label},request_key:crypto.randomUUID()}));const approved=(await ok(await owner.request(path+'?month='+month))).statement;assert.equal((await save(admin,payload,approved.version)).status,409);
  assert.equal((await admin.request(path,{id:payrollId,month,version:approved.version,command:'pay',payload:{amount:'3000.67',reference:label,reason:label},request_key:crypto.randomUUID()})).status,400);
 });
 await check('flexible attendance: eight daily hours, Friday off, owner read-only, invalid duration rejected',async()=>{
  const data={employee_id:employee.id,workdays:[0,1,2,3,4,6],schedule_mode:'flexible',daily_minutes:480,year:2089,days:1,reason:label};
  await ok(await admin.request('/api/workforce/attendance',data,'PATCH'));const own=await ok(await owner.request('/api/workforce/attendance?year=2089'));assert.equal(own.settings.schedule_mode,'flexible');assert.equal(own.settings.daily_minutes,480);assert(!own.settings.workdays.includes(5));
  assert.equal((await owner.request('/api/workforce/attendance',data,'PATCH')).status,403);assert.equal((await admin.request('/api/workforce/attendance',{...data,daily_minutes:0},'PATCH')).status,400);
 });
 await check('weekly plan: atomic assignment, duplicate retry and employee rejection',async()=>{
  const tasks=[employee.id,other.id].map((assignee_id,i)=>({id:crypto.randomUUID(),title:`${label} ${i}`,client_name:label,assignee_id,starts_at:'2026-10-20T09:00:00+03:00',due_at:'2026-10-20T17:00:00+03:00',completion_criteria:'نتيجة اختبار موثقة',requires_approval:true}));ids.push(...tasks.map(t=>t.id));const body={tasks,request_key:crypto.randomUUID()};await ok(await admin.request('/api/workforce/weekly-plan',body));await ok(await admin.request('/api/workforce/weekly-plan',body));assert.equal((await owner.request('/api/workforce/weekly-plan',{...body,request_key:crypto.randomUUID()})).status,403);
 });
 await check('task comments and time: owner creates/edits, peer reads task but cannot act, personal time page works',async()=>{
  const id=ids[0],comment=crypto.randomUUID(),entry=crypto.randomUUID();await ok(await cmd(owner,id,'create',{comment_id:comment,body:label},null,'comments'));assert.equal((await cmd(peer,id,'create',{comment_id:crypto.randomUUID(),body:label},null,'comments')).status,403);await ok(await cmd(owner,id,'edit',{comment_id:comment,body:label+' updated'},1,'comments'));
  await ok(await cmd(owner,id,'create',{entry_id:entry,starts_at:'2026-10-17T10:00:00+03:00',ends_at:'2026-10-17T11:00:00+03:00',note:label},null,'time'));assert.equal((await cmd(peer,id,'edit',{entry_id:entry,starts_at:'2026-10-17T10:00:00+03:00',ends_at:'2026-10-17T11:30:00+03:00',note:label,reason:label},1,'time')).status,403);
  const own=await ok(await owner.request('/api/workforce/my-work?mode=time'));assert(own.rows.some(row=>row.id===entry));const theirs=await ok(await peer.request('/api/workforce/my-work?mode=time'));assert(!theirs.rows.some(row=>row.id===entry));
  await ok(await owner.request('/api/workforce/my-work?mode=deliveries'));
 });
 await check('profile, work and request subpages are present; sensitive employee data remains private',async()=>{
  for(const suffix of ['profile','profile/job-description','profile/contract','profile/compensation','profile/payment-details','profile/documents','work/projects','work/calendar','work/time','work/deliveries','work/archive','requests/general','requests/leave','requests/permission','requests/remote-work','requests/expenses','requests/advance','requests/attendance-correction','requests/letter','requests/payroll-review','requests/profile-change'])assert.equal((await owner.request('/employee/'+suffix)).status,200,suffix);
  assert.equal((await peer.request('/api/workforce/employees/'+employee.id)).status,404);const hidden=await peer.db.from('wf_employees').select('national_id,birth_date').eq('id',employee.id);assert.ifError(hidden.error);assert.equal(hidden.data.length,0);
 });
}finally {
 if(ids.length)await service.from('wf_tasks').update({archived_at:new Date().toISOString(),updated_by:state.accounts.admin.id}).in('id',ids).eq('created_by',state.accounts.admin.id);
 await writeFile('.workforce-test/employee-tools-results.json',JSON.stringify({label,ids,payrollId,month,checks},null,2));
}
