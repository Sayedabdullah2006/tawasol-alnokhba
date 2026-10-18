import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {parse} from 'dotenv';import {createClient} from '@supabase/supabase-js';import {createServerClient} from '@supabase/ssr';import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8')),base=process.env.WORKFORCE_TEST_URL||'http://localhost:3102';assertWorkforceTestTarget(base);const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),checks=[],label=`QA-profile-${Date.now()}`;
async function session(account){const jar=new Map(),db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:account.email,password:state.password})).error);return {db,request:(path,options={})=>fetch(base+path,{...options,headers:{Cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; '),Origin:base,...(options.body instanceof FormData?{}:{'Content-Type':'application/json'})}})};}
const admin=await session(state.accounts.admin),a=await session(state.accounts.a),b=await session(state.accounts.b);async function ok(response){const data=await response.json();assert(response.ok,`${response.status}: ${JSON.stringify(data)}`);return data;}async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
const employee=(await service.from('wf_employees').select('*').eq('user_id',state.accounts.a.id).single()).data,path=`/api/workforce/employees/${employee.id}`,documentId=crypto.randomUUID();let changeId;assert(employee.email.startsWith(state.prefix));
await service.from("wf_profile_change_requests").update({status:"cancelled",decision_reason:"تهيئة اختبار الجودة"}).eq("employee_id",employee.id).eq("field","full_name").eq("status","pending");
try{
 await check('employee profile: save own contact details, reject peer access and protected fields',async()=>{
 const original=await ok(await a.request(path));await ok(await a.request(path,{method:'PATCH',body:JSON.stringify({action:'profile',version:original.employee.version,phone:'0500000000',city:'مدينة اختبار'})}));const updated=await ok(await a.request(path));assert.equal(updated.employee.city,'مدينة اختبار');assert.equal((await b.request(path)).status,404);
 assert.equal((await a.request(path,{method:'PATCH',body:JSON.stringify({action:'profile',version:updated.employee.version,phone:'',city:'',job_title:'غير مسموح'})})).status,403);
 });
 await check('employee documents: own upload, private download, admin archive/restore with audit',async()=>{
 const data=new FormData();data.set('employee_id',employee.id);data.set('title',label);data.set('request_key',documentId);data.append('file',new File([await readFile('.workforce-test/sample.png')],'qa-profile.png',{type:'image/png'}));await ok(await a.request('/api/workforce/documents',{method:'POST',body:data}));
 assert.equal((await a.request('/api/workforce/documents/'+documentId)).status,200);assert.equal((await b.request('/api/workforce/documents/'+documentId)).status,404);
 assert.equal((await a.request('/api/workforce/documents/'+documentId,{method:'PATCH',body:JSON.stringify({archived:true})})).status,403);
 for(const archived of [true,false,true]){await ok(await admin.request('/api/workforce/documents/'+documentId,{method:'PATCH',body:JSON.stringify({archived})}));assert.equal((await a.request('/api/workforce/documents/'+documentId)).status,archived?404:200);}
 });
 await check('sensitive profile change: employee requests, administrator decides, own history and private notifications',async()=>{
 const response=await ok(await a.request('/api/workforce/profile-changes',{method:'POST',body:JSON.stringify({field:'full_name',proposed_value:'اختبار الجودة — اسم محدث',reason:label,request_key:crypto.randomUUID()})}));changeId=response.id;
 assert.equal((await a.request('/api/workforce/profile-changes',{method:'PATCH',body:JSON.stringify({id:changeId,decision:'approved',reason:label})})).status,403);
 const pending=await ok(await admin.request('/api/workforce/profile-changes'));assert(pending.requests.some(row=>row.id===changeId));await ok(await admin.request('/api/workforce/profile-changes',{method:'PATCH',body:JSON.stringify({id:changeId,decision:'approved',reason:label})}));
 const updated=await ok(await a.request(path));assert.equal(updated.employee.full_name,'اختبار الجودة — اسم محدث');assert(updated.changes.some(row=>row.id===changeId&&row.status==='approved'));
 const notifications=await a.db.from('wf_notifications').select('id,href').eq('event_key',`profile-request:${changeId}:approved`);assert.ifError(notifications.error);assert.equal(notifications.data.length,1);const peer=await b.db.from('wf_notifications').select('id').eq('id',notifications.data[0].id);assert.ifError(peer.error);assert.equal(peer.data.length,0);
 });
 console.log(`PASS ${checks.length} profile integration groups`);
}finally{
 await service.from('wf_employees').update({full_name:employee.full_name,phone:employee.phone,city:employee.city,updated_by:state.accounts.admin.id}).eq('id',employee.id).eq('user_id',state.accounts.a.id);
 await service.from('wf_employee_documents').update({archived_at:new Date().toISOString()}).eq('id',documentId).eq('employee_id',employee.id);
 if(changeId){await service.from('wf_profile_change_requests').update({status:'cancelled',decision_reason:'انتهى الاختبار'}).eq('id',changeId).eq('status','pending');await service.from('wf_notifications').update({read_at:new Date().toISOString()}).in('event_key',[`profile-request:${changeId}`,`profile-request:${changeId}:approved`]);}
 await writeFile('.workforce-test/profile-results.json',JSON.stringify({base,label,checks,documentId,changeId},null,2));
}
