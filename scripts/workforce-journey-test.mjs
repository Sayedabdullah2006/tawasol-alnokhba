import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8'));
const base=process.env.WORKFORCE_TEST_URL||'http://localhost:3102';assertWorkforceTestTarget(base);
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),ids=[],tasks=[],checks=[],label=`QA-journey-${Date.now()}`;
async function session(account){const jar=new Map(),db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});const {error}=await db.auth.signInWithPassword({email:account.email,password:state.password});assert.ifError(error);return {db,request:(path,options={})=>fetch(base+path,{...options,headers:{Cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; '),Origin:base,...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}})};}
async function ok(response){const body=await response.json();assert(response.ok,`${response.status}: ${JSON.stringify(body)}`);return body;}
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
const admin=await session(state.accounts.admin),a=await session(state.accounts.a),b=await session(state.accounts.b),client=await session(state.accounts.client);
const employee=(await service.from('wf_employees').select('*').eq('user_id',state.accounts.a.id).single()).data;
function form(kind='general',id=crypto.randomUUID(),attachment=false){const data=new FormData();data.set('request_key',id);data.set('kind',kind);data.set('title',`${label} ${kind}`);data.set('body','بيانات اختبار دورة الطلب فقط');if(['leave','permission','remote-work','attendance-correction'].includes(kind)){data.set('starts_at','2030-10-21T09:00:00+03:00');data.set('ends_at','2030-10-21T16:00:00+03:00');}if(['expenses','advance'].includes(kind))data.set('amount','125.50');if(attachment)data.append('files',new File([png],'receipt.png',{type:'image/png'}));return data;}
const png=await readFile('.workforce-test/sample.png');let first,attachment;
const cmd=(actor,id,command,payload,version=null)=>actor.request('/api/workforce/tasks',{method:'POST',body:JSON.stringify({id,command,payload,version,request_key:crypto.randomUUID()})});
try{
 await check('requests: anonymous/client denied, all nine types submit with dates and amounts',async()=>{
 assert.equal((await fetch(base+'/api/workforce/requests')).status,401);assert.equal((await client.request('/api/workforce/requests')).status,403);assert.equal((await a.request('/api/workforce/requests',{method:'POST',body:form(),headers:{Origin:'https://example.org'}})).status,403);
 for(const kind of ['general','leave','permission','remote-work','expenses','advance','letter','payroll-review','attendance-correction']){const id=crypto.randomUUID();ids.push(id);const data=form(kind,id,kind==='general');await ok(await a.request('/api/workforce/requests',{method:'POST',body:data}));}
 first=ids[0];const data=await ok(await a.request('/api/workforce/requests?request='+first));assert.equal(data.requests[0].status,'pending');attachment=data.requests[0].attachments[0];assert(attachment);assert(!JSON.stringify(data).includes('object_path'));assert(!JSON.stringify(data).includes('fingerprint'));
 });
 await check('requests: idempotent retry, mismatched key rejected, validation rejects malformed date/amount/files',async()=>{
 await ok(await a.request('/api/workforce/requests',{method:'POST',body:form('general',first,true)}));const mismatch=form('general',first,true);mismatch.set('title','عنوان آخر');assert.equal((await a.request('/api/workforce/requests',{method:'POST',body:mismatch})).status,409);
 const invalid=form('leave');invalid.set('starts_at','2030-02-30T09:00:00+03:00');assert.equal((await a.request('/api/workforce/requests',{method:'POST',body:invalid})).status,400);
 const money=form('advance');money.set('amount','-100');assert.equal((await a.request('/api/workforce/requests',{method:'POST',body:money})).status,400);
 const files=form();files.append('files',new File(['invalid'],'bad.png',{type:'image/png'}));assert.equal((await a.request('/api/workforce/requests',{method:'POST',body:files})).status,400);
 });
 await check('requests: owner/admin download and preview, peer API and RLS cannot read or decide',async()=>{
 const path=`/api/workforce/requests/${first}/attachments/${attachment.id}`;
 for(const actor of [a,admin]){const res=await actor.request(path+'?preview=true');assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await res.arrayBuffer()),png);assert.match((await actor.request(path)).headers.get('Content-Disposition'),/^attachment/);}
 assert.equal((await b.request(path)).status,404);assert.equal((await fetch(base+path)).status,401);assert.equal((await ok(await b.request('/api/workforce/requests?request='+first))).requests.length,0);
 const direct=await b.db.from('wf_employee_requests').select('*').eq('id',first);assert.ifError(direct.error);assert.equal(direct.data.length,0);
 const directWrite=await a.db.from('wf_employee_requests').update({status:'approved'}).eq('id',first);assert(directWrite.error);
 assert.equal((await b.request('/api/workforce/requests',{method:'PATCH',body:JSON.stringify({id:first,version:1,decision:'cancelled'})})).status,404);
 assert.equal((await a.request('/api/workforce/requests',{method:'PATCH',body:JSON.stringify({id:first,version:1,decision:'approved',reason:'قرار غير مسموح'})})).status,403);
 });
 await check('requests: atomic approve/reject/cancel, stale decision rejected, notifications private',async()=>{
 for(const [id,decision,actor] of [[first,'approved',admin],[ids[1],'rejected',admin],[ids[2],'cancelled',a]])await ok(await actor.request('/api/workforce/requests',{method:'PATCH',body:JSON.stringify({id,version:1,decision,reason:'قرار اختبار دورة الطلب'})}));
 assert.equal((await admin.request('/api/workforce/requests',{method:'PATCH',body:JSON.stringify({id:first,version:1,decision:'rejected',reason:'نسخة قديمة'})})).status,409);
 assert.equal((await ok(await a.request('/api/workforce/requests?request='+first))).requests[0].status,'approved');
 const notifications=await service.from('wf_notifications').select('id,recipient_id').eq('event_key',`employee-request:${first}:approved`);assert.ifError(notifications.error);assert.equal(notifications.data.length,1);assert.equal(notifications.data[0].recipient_id,state.accounts.a.id);
 const peer=await b.db.from('wf_notifications').select('id').eq('id',notifications.data[0].id);assert.ifError(peer.error);assert.equal(peer.data.length,0);
 });
 await check('job description: admin edits, owner sees, employee/peer cannot edit',async()=>{
 const patch={action:'profile',version:employee.version,full_name:employee.full_name,phone:employee.phone,city:employee.city,job_title:employee.job_title,responsibilities:'وصف وظيفي اختباري لدورة الموظفة',department_id:employee.department_id,contract_type:employee.contract_type,start_date:employee.start_date,contract_end:employee.contract_end};
 await ok(await admin.request(`/api/workforce/employees/${employee.id}`,{method:'PATCH',body:JSON.stringify(patch)}));
 const detail=await ok(await a.request(`/api/workforce/employees/${employee.id}`));assert.equal(detail.employee.responsibilities,patch.responsibilities);
 assert.equal((await a.request(`/api/workforce/employees/${employee.id}`,{method:'PATCH',body:JSON.stringify({...patch,version:detail.employee.version})})).status,403);
 assert.equal((await b.request(`/api/workforce/employees/${employee.id}`)).status,404);
 });
 await check('Trello: per-lane counts and columns, owner moves, peer denied, approval cannot be bypassed',async()=>{
 for(let i=0;i<21;i++){const id=crypto.randomUUID();tasks.push(id);await ok(await cmd(admin,id,'create',{title:`${label} مهمة ${i}`,client_name:label,assignee_id:employee.id,requires_approval:true}));}
 const data=await ok(await a.request('/api/workforce/tasks?view=board&sort=position&client_name='+encodeURIComponent(label)));assert.equal(data.count,21);assert.equal(data.laneCounts.new,21);assert.equal(data.tasks.length,20);const next=await ok(await a.request("/api/workforce/tasks?view=list&state=new&sort=position&page=2&client_name="+encodeURIComponent(label)));assert.equal(next.tasks.length,1);assert(data.columns.some(column=>column.kind==='in_progress'));
 const task=data.tasks[0],column=data.columns.find(column=>column.board_id===task.board_id&&column.kind==='in_progress');assert(column);
 assert.equal((await cmd(b,task.id,'move',{column_id:column.id,position:1024},task.version)).status,403);
 await ok(await cmd(a,task.id,'move',{column_id:column.id,position:1024},task.version));
 const detail=await ok(await a.request('/api/workforce/tasks/'+task.id));assert.equal(detail.task.column.kind,'in_progress');assert(detail.boardDetail.columns.length>=5);
 const done=detail.boardDetail.columns.find(column=>column.kind==='done');assert([400,409].includes((await cmd(a,task.id,'move',{column_id:done.id},detail.task.version)).status));
 });
 await check('employee/admin available sections render without descriptive overview pages; customer pages remain accessible',async()=>{
 for(const path of ['/employee','/employee/work/tasks','/employee/requests/history','/employee/requests/leave','/employee/requests/expenses','/employee/profile','/employee/profile/documents','/employee/requests/profile-change','/employee/finance/overview','/employee/finance/compensation','/employee/finance/payment-details','/employee/notifications/inbox']){const res=await a.request(path);assert.equal(res.status,200,path);const html=await res.text();assert(!html.includes('معاينة الهيكلية'),path);assert(!html.includes('نظرة عامة على القسم'),path);assert(!html.includes('المتوقع تقدير للشهر'),path);}
 for(const path of ['/admin/workforce','/admin/workforce/approvals','/admin/workforce/employees','/admin/workforce/payroll','/admin/workforce/notifications','/admin/requests'])assert.equal((await admin.request(path)).status,200,path);
 for(const path of ['/dashboard','/dashboard/profile','/request/start'])assert.equal((await client.request(path)).status,200,path);
 });
 console.log(`PASS ${checks.length} journey integration groups`);
}finally{
 // Restore only the QA employee field and archive only tasks created by this test.
 await service.from('wf_employees').update({responsibilities:employee.responsibilities||'',updated_by:state.accounts.admin.id}).eq('id',employee.id).eq('user_id',state.accounts.a.id);
 if(tasks.length)await service.from('wf_tasks').update({archived_at:new Date().toISOString(),updated_by:state.accounts.admin.id}).in('id',tasks).eq('created_by',state.accounts.admin.id);
 if(ids.length){await service.from('wf_employee_requests').update({status:'cancelled',decision_reason:'انتهى الاختبار',decided_at:new Date().toISOString()}).in('id',ids).eq('employee_id',employee.id).eq('status','pending');await service.from('wf_notifications').update({read_at:new Date().toISOString()}).in('event_key',ids.flatMap(id=>[`employee-request:${id}`,`employee-request:${id}:approved`,`employee-request:${id}:rejected`,`employee-request:${id}:cancelled`]));}
 await writeFile('.workforce-test/journey-results.json',JSON.stringify({base,label,checks,ids,tasks},null,2));
}
