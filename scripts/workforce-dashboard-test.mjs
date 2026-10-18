import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
// Run against localhost and the existing, isolated QA staff only.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8'))
const base=process.env.WORKFORCE_TEST_URL||'http://localhost:3100'
assertWorkforceTestTarget(base)
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
async function session(account){
  const jar=new Map()
  const db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  const {error}=await db.auth.signInWithPassword({email:account.email,password:state.password});if(error)throw error
  return {db,request:(path,options={})=>fetch(`${base}${path}`,{...options,headers:{Cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; '),'Content-Type':'application/json'}})}
}
const admin=await session(state.accounts.admin),first=await session(state.accounts.a),client=await session(state.accounts.client)
const {data:staff,error}=await service.from('wf_employees').select('id,user_id,email,status').in('email',[state.accounts.a.email,state.accounts.b.email]);assert.ifError(error)
assert.equal(staff.length,2);assert(staff.every(e=>e.status==='active'&&e.email.startsWith(state.prefix)))
const a=staff.find(e=>e.email===state.accounts.a.email),b=staff.find(e=>e.email===state.accounts.b.email)
const label=`QA Dashboard ${Date.now()}`, ids=[]
const ok=async r=>{const body=await r.json();assert(r.ok,`${r.status}: ${JSON.stringify(body)}`);return body}
const cmd=(actor,id,command,payload,version=null)=>actor.request('/api/workforce/tasks',{method:'POST',body:JSON.stringify({id,command,payload,version,request_key:crypto.randomUUID()})})
const detail=async id=>(await ok(await admin.request(`/api/workforce/tasks/${id}`))).task
const dashboard=async extra=>ok(await admin.request(`/api/workforce/dashboard?client_name=${encodeURIComponent(label)}${extra||''}`))
const report={checks:[],label,ids}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name)}
async function create(assignee,due,title){const id=crypto.randomUUID();ids.push(id);await ok(await cmd(admin,id,'create',{title:`${label} ${title}`,client_name:label,assignee_id:assignee,due_at:due,requires_approval:true,completion_criteria:'دليل التسليم والنتيجة'}));return id}
try{
  await check('dashboard API and direct RPC reject employee, client and anonymous',async()=>{
    assert.equal((await first.request('/api/workforce/dashboard')).status,403)
    assert.equal((await client.request('/api/workforce/dashboard')).status,403)
    assert.equal((await fetch(`${base}/api/workforce/dashboard`)).status,401)
    const denied=await first.db.rpc('wf_admin_dashboard');assert(denied.error)
  })
  const overdue=await create(a.id,'2020-01-01T16:00:00+03:00','متأخرة')
  const complete=await create(a.id,'2030-10-25T16:00:00+03:00','منجزة')
  const review=await create(b.id,'2030-10-25T16:00:00+03:00','للمراجعة')
  await create(null,null,'غير مسندة بلا موعد')
  const archived=await create(a.id,'2030-10-25T16:00:00+03:00','مؤرشفة')
  let task=await detail(archived);await ok(await cmd(admin,archived,'archive',{archived:true},task.version))
  task=await detail(complete);await ok(await cmd(first,complete,'submit',{summary:'نتيجة اختبار لوحة الأداء https://example.com/qa'},task.version))
  task=await detail(complete);await ok(await cmd(admin,complete,'review',{decision:'approved',reason:'اعتماد اختبار لوحة الأداء'},task.version))
  const second=await session(state.accounts.b)
  task=await detail(review);await ok(await cmd(second,review,'submit',{summary:'تسليم ينتظر اعتماد الإدارة https://example.com/qa-pending'},task.version))
  await check('exact totals and per-employee counts, archived work excluded',async()=>{
    const data=await dashboard()
    assert.deepEqual(data.totals,{assigned:4,completed:1,open:3,in_progress:0,overdue:1,pending:1,blocked:0,dated_completed:1,on_time:1})
    const row=data.employees.find(e=>e.id===a.id);assert.equal(row.metrics.assigned,2);assert.equal(row.metrics.completed,1);assert.equal(row.metrics.overdue,1)
    assert.equal(data.employees.find(e=>e.id===b.id).metrics.pending,1);assert.equal(data.unassigned.assigned,1)
  })
  await check('employee, client and Riyadh deadline filters agree with totals',async()=>{
    assert.equal((await dashboard(`&assignee_id=${a.id}`)).totals.assigned,2)
    const range=await dashboard('&due_from=2030-10-25&due_to=2030-10-25');assert.equal(range.totals.assigned,2);assert.equal(range.unassigned,null)
    assert.equal((await admin.request('/api/workforce/dashboard?due_from=2026-02-30')).status,400)
    assert.equal((await admin.request('/api/workforce/dashboard?due_from=2030-10-26&due_to=2030-10-25')).status,400)
    const zero=await ok(await admin.request('/api/workforce/dashboard?client_name=nonexistent-QA-client'));assert.equal(zero.totals.assigned,0);assert(zero.employees.every(e=>e.metrics.assigned===0))
  })
  await check('approval immediately refreshes pending and completed metrics',async()=>{
    task=await detail(review);await ok(await cmd(admin,review,'review',{decision:'approved',reason:'اعتماد التسليم المعلق من الداشبورد'},task.version))
    const data=await dashboard();assert.equal(data.totals.pending,0);assert.equal(data.totals.completed,2)
    assert.equal((await cmd(admin,review,'review',{decision:'approved',reason:'طلب قديم مكرر'},task.version)).status,409)
  })
  await check('unified dashboard, directory and legacy task pages render',async()=>{
    for(const path of ['/admin/workforce','/admin/workforce/employees','/admin/workforce/tasks'])assert.equal((await admin.request(path)).status,200,path)
    assert.equal((await dashboard('&state=done&page=999')).totals.assigned,4)
  })
  console.log(`PASS ${report.checks.length} dashboard integration groups`)
}finally{
  const archived=await service.from('wf_tasks').update({archived_at:new Date().toISOString(),updated_by:state.accounts.admin.id}).in('id',ids).eq('created_by',state.accounts.admin.id);assert.ifError(archived.error)
  const notifications=await service.from('wf_notifications').update({read_at:new Date().toISOString()}).in('task_id',ids);assert.ifError(notifications.error)
  await writeFile('.workforce-test/dashboard-results.json',JSON.stringify(report,null,2))
}
