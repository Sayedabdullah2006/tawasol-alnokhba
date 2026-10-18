import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {parse} from 'dotenv';import {createClient} from '@supabase/supabase-js';import {createServerClient} from '@supabase/ssr';import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8')),base=process.env.WORKFORCE_TEST_URL||'http://localhost:3102';assertWorkforceTestTarget(base);
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),checks=[],ids=[],label=`QA-attendance-${Date.now()}`;
async function session(account){const jar=new Map(),db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});const {error}=await db.auth.signInWithPassword({email:account.email,password:state.password});assert.ifError(error);return {db,request:(path,options={})=>fetch(base+path,{...options,headers:{Cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; '),Origin:base,...(options.body instanceof FormData?{}:{'Content-Type':'application/json'})}})};}
async function ok(response){const data=await response.json();assert(response.ok,`${response.status}: ${JSON.stringify(data)}`);return data;}async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
const admin=await session(state.accounts.admin),a=await session(state.accounts.a),b=await session(state.accounts.b);const employee=(await service.from('wf_employees').select('id').eq('user_id',state.accounts.a.id).single()).data;
const entitlements=await service.from('wf_leave_entitlements').select('year').eq('employee_id',employee.id);assert.ifError(entitlements.error);
const leaveYear=Array.from({length:170},(_,i)=>2030+i).find(year=>new Date(Date.UTC(year,9,21)).getUTCDay()===1&&!entitlements.data.some(row=>row.year===year));assert(leaveYear);
const oldSessions=await service.from('wf_attendance_sessions').select('business_date').eq('employee_id',employee.id).gte('business_date','2020-01-01').lte('business_date','2020-12-31');assert.ifError(oldSessions.error);
const correctionDate=Array.from({length:300},(_,i)=>new Date(Date.UTC(2020,0,5+i)).toISOString().slice(0,10)).find(day=>!oldSessions.data.some(row=>row.business_date===day));
const clock=(command,key=crypto.randomUUID())=>a.request('/api/workforce/attendance',{method:'POST',body:JSON.stringify({command,request_key:key})});
async function request(kind,start,end,extra={}){start=start.replace('2030',String(leaveYear)).replace('2020-01-05',correctionDate);end=end.replace('2030',String(leaveYear)).replace('2020-01-05',correctionDate);const id=crypto.randomUUID();ids.push(id);const form=new FormData();for(const [key,value]of Object.entries({request_key:id,kind,title:`${label} ${kind}`,body:'طلب اختبار حضور وإجازات',starts_at:start,ends_at:end,...extra}))form.set(key,value);await ok(await a.request('/api/workforce/requests',{method:'POST',body:form}));return id;}
const decision=(id)=>admin.request('/api/workforce/requests',{method:'PATCH',body:JSON.stringify({id,version:1,decision:'approved',reason:'اعتماد اختبار الحضور والإجازة'})});
let liveId;try{
 await check('attendance: server clock, one open record, idempotent check-in/out, no employee time injection',async()=>{
 const initial=await ok(await a.request('/api/workforce/attendance'));assert.equal(initial.open,null,'QA employee must start without an open session');
 const key=crypto.randomUUID(),before=Date.now();const row=await ok(await clock('in',key));liveId=row.id;assert.equal(row.id,key);assert(Math.abs(Date.parse(row.checked_in)-before)<20000);assert.equal((await ok(await clock('in',key))).id,key);
 assert.equal((await clock('in')).status,409);assert.equal((await a.request('/api/workforce/attendance',{method:'POST',body:JSON.stringify({command:'in',request_key:crypto.randomUUID(),checked_in:'2020-01-01'})})).status,400);
 const out=crypto.randomUUID();await ok(await clock('out',out));const repeated=await ok(await clock('out',out));assert(repeated.checked_out);assert.equal((await clock('out')).status,409);assert.equal((await ok(await a.request('/api/workforce/attendance'))).open,null);
 });
 await check('attendance: private records, employee cannot configure, authenticated direct writes/RPC denied',async()=>{
 assert.equal((await fetch(base+'/api/workforce/attendance')).status,401);
 const peer=await b.db.from('wf_attendance_sessions').select('id').eq('employee_id',employee.id);assert.ifError(peer.error);assert.equal(peer.data.length,0);
 assert((await a.db.from('wf_attendance_sessions').update({checked_in:'2020-01-01'}).eq('id',liveId)).error);assert((await a.db.rpc('wf_clock_attendance',{p_actor:state.accounts.a.id,p_command:'in',p_key:crypto.randomUUID()})).error);
 assert.equal((await a.request('/api/workforce/attendance',{method:'PATCH',body:JSON.stringify({})})).status,403);
 const adminView=await ok(await admin.request(`/api/workforce/attendance?employee_id=${employee.id}`));assert(adminView.sessions.some(row=>row.id===liveId));
 });
 await check('attendance: administrator schedule and entitlement save, owner reads same values',async()=>{
 await ok(await admin.request('/api/workforce/attendance',{method:'PATCH',body:JSON.stringify({employee_id:employee.id,workdays:[0,1,2,3,4],starts_at:'10:00',ends_at:'18:00',year:leaveYear,days:5,reason:label})}));
 const data=await ok(await a.request(`/api/workforce/attendance?year=${leaveYear}`));assert.equal(data.settings.starts_at,'10:00:00');assert.equal(data.leave.granted,5);
 });
 await check('leave: approval deducts only workdays, duplicate and insufficient balance rejected atomically',async()=>{
 const id=await request('leave','2030-10-21T09:00:00+03:00','2030-10-22T17:00:00+03:00');await ok(await decision(id));let data=await ok(await a.request(`/api/workforce/attendance?year=${leaveYear}`));assert.equal(data.leave.used,2);assert.equal(data.leave.available,3);assert(data.approved.some(row=>row.id===id));
 const overlap=await request('leave','2030-10-21T09:00:00+03:00','2030-10-22T17:00:00+03:00');assert.equal((await decision(overlap)).status,409);
 const tooMuch=await request('leave','2030-10-27T09:00:00+03:00','2030-10-31T17:00:00+03:00');assert.equal((await decision(tooMuch)).status,400);
 data=await ok(await a.request(`/api/workforce/attendance?year=${leaveYear}`));assert.equal(data.leave.used,2);
 assert.equal((await admin.request('/api/workforce/attendance',{method:'PATCH',body:JSON.stringify({employee_id:employee.id,workdays:[0,1,2,3,4],starts_at:'10:00',ends_at:'18:00',year:leaveYear,days:1,reason:label})})).status,400);
 });
 await check('attendance correction: approval creates and updates a private session, future correction denied',async()=>{
 const id=await request('attendance-correction','2020-01-05T09:00:00+03:00','2020-01-05T12:00:00+03:00');await ok(await decision(id));let data=await ok(await a.request('/api/workforce/attendance?year=2020'));const row=data.sessions.find(row=>row.business_date===correctionDate);assert(row);assert.equal(row.source,'correction');
 const change=await request('attendance-correction','2020-01-05T10:00:00+03:00','2020-01-05T13:00:00+03:00',{attendance_session_id:row.id});await ok(await decision(change));data=await ok(await a.request('/api/workforce/attendance?year=2020'));assert.equal(Date.parse(data.sessions.find(item=>item.id===row.id).checked_in),Date.parse(`${correctionDate}T10:00:00+03:00`));
 const future=await request('attendance-correction','2030-10-21T09:00:00+03:00','2030-10-21T12:00:00+03:00');assert.equal((await decision(future)).status,400);
 });
 await check('attendance and leave subpages render usable controls, no structure previews',async()=>{for(const path of ['/employee/attendance/overview','/employee/attendance/schedule','/employee/attendance/leave-balances']){const res=await a.request(path);assert.equal(res.status,200);const text=await res.text();assert(!text.includes('معاينة الهيكلية'));assert(!text.includes('نظرة عامة على القسم'));}assert.equal((await admin.request('/admin/workforce/attendance')).status,200);});
 console.log(`PASS ${checks.length} attendance integration groups`);
}finally{
 if(liveId)await service.from('wf_attendance_sessions').update({checked_out:new Date().toISOString(),note:label}).eq('id',liveId).eq('employee_id',employee.id).is('checked_out',null);
 if(ids.length)await service.from('wf_employee_requests').update({status:'cancelled',decision_reason:'انتهى الاختبار',decided_at:new Date().toISOString()}).in('id',ids).eq('employee_id',employee.id).eq('status','pending');
 await writeFile('.workforce-test/attendance-results.json',JSON.stringify({base,label,checks,ids,liveId},null,2));
}
