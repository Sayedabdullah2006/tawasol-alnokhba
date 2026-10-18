import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
// All financial amounts below are fictitious QA records; no payment provider is called.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {parse} from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8'))
const base=process.env.WORKFORCE_TEST_URL||'http://localhost:3100';assertWorkforceTestTarget(base)
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
async function session(account){const jar=new Map();const db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});const{error}=await db.auth.signInWithPassword({email:account.email,password:state.password});if(error)throw error;return{db,request:(path,options={})=>fetch(`${base}${path}`,{...options,headers:{Cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; '),'Content-Type':'application/json'}})}}
const admin=await session(state.accounts.admin),first=await session(state.accounts.a),second=await session(state.accounts.b),client=await session(state.accounts.client)
const {data:staff,error}=await service.from('wf_employees').select('id,email').in('email',[state.accounts.a.email,state.accounts.b.email]);assert.ifError(error);assert.equal(staff.length,2)
const a=staff.find(e=>e.email===state.accounts.a.email),b=staff.find(e=>e.email===state.accounts.b.email)
const existing=await service.from('wf_monthly_payroll').select('month').eq('employee_id',a.id);assert.ifError(existing.error)
const months=Array.from({length:120},(_,i)=>`${2090+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`)
const month=months.find(m=>!existing.data.some(e=>e.month.startsWith(m)));assert(month)
const id=crypto.randomUUID(),path=`/api/workforce/employees/${a.id}/payroll`, report={checks:[],id,month}
const ok=async r=>{const body=await r.json();assert(r.ok,`${r.status}: ${JSON.stringify(body)}`);return body}
const load=async(actor=admin)=>ok(await actor.request(`${path}?month=${month}`))
const send=(actor,command,payload,version,key=crypto.randomUUID())=>actor.request(path,{method:'POST',body:JSON.stringify({id,month,version,command,payload,request_key:key})})
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name)}
const payload={basic_amount:'5000.01',allowances_amount:'500.02',items:[{title:'QA fixed award',mode:'fixed',value:'250.10',basis_amount:'',task_id:'',reference:'QA fictitious deal A'},{title:'QA percentage award',mode:'percent',value:'7.125',basis_amount:'1000.01',task_id:'',reference:'QA fictitious deal B'}],notes:'QA ONLY — not an actual salary or payment',reason:'QA test monthly statement'}
try{
  await check('financial access is private and all mutations are admin-only',async()=>{
    assert.equal((await fetch(`${base}${path}?month=${month}`)).status,401);assert.equal((await client.request(`${path}?month=${month}`)).status,403);assert.equal((await second.request(`${path}?month=${month}`)).status,404)
    assert.equal((await send(first,'save',payload,0)).status,403)
    const denied=await first.db.rpc('wf_payroll_command',{p_actor:state.accounts.admin.id,p_id:id,p_employee:a.id,p_month:month+'-01',p_version:0,p_command:'save',p_payload:payload,p_key:crypto.randomUUID()});assert(denied.error)
  })
  await check('server computes exact salary, fixed incentives and percentages, with safe retries',async()=>{
    const key=crypto.randomUUID();const results=await Promise.all([send(admin,'save',payload,0,key),send(admin,'save',payload,0,key)]);assert.deepEqual(await ok(results[0]),await ok(results[1]))
    const data=await load();assert.equal(data.statement.total_amount,'5821.38');assert.equal(data.statement.items[1].amount,'71.25');assert.equal(data.statement.status,'draft');assert.equal((await load(first)).statement.total_amount,'5821.38')
    const peer=await second.db.from('wf_monthly_payroll').select('id').eq('id',id);assert.ifError(peer.error);assert.equal(peer.data.length,0)
    const update=await first.db.from('wf_monthly_payroll').update({total_amount:1}).eq('id',id);assert(update.error)
  })
  await check('rejects forged calculated amounts and invalid percentage values',async()=>{
    const version=(await load()).statement.version
    assert.equal((await send(admin,'save',{...payload,items:[{...payload.items[0],amount:'99999'}]},version)).status,400)
    assert.equal((await send(admin,'save',{...payload,items:[{...payload.items[1],value:'101'}]},version)).status,400)
    assert.equal((await send(admin,'save',{...payload,basic_amount:'-1'},version)).status,400)
    assert.equal((await send(admin,'save',{...payload,items:[{...payload.items[0],reference:''}]},version)).status,400)
  })
  await check('approval freezes the estimate, can reopen before any payment',async()=>{
    let s=(await load()).statement;await ok(await send(admin,'approve',{reason:'QA approval'},s.version));s=(await load()).statement;assert.equal(s.status,'approved')
    assert.equal((await send(admin,'save',payload,s.version)).status,409)
    await ok(await send(admin,'reopen',{reason:'QA reopen before payment'},s.version));s=(await load()).statement;assert.equal(s.status,'draft')
    await ok(await send(admin,'approve',{reason:'QA reapproval'},s.version))
  })
  await check('payment recording is partial, idempotent and cannot exceed or duplicate the amount',async()=>{
    let s=(await load()).statement;const key=crypto.randomUUID(),pay={amount:'100.00',reference:'QA fictitious payment reference',reason:'QA record only, no money sent'}
    const responses=await Promise.all([send(admin,'pay',pay,s.version,key),send(admin,'pay',pay,s.version,key)]);assert.deepEqual(await ok(responses[0]),await ok(responses[1]))
    let data=await load();assert.equal(data.statement.paid_amount,'100');assert.equal(data.payments_count,1);s=data.statement
    assert.equal((await send(admin,'pay',pay,s.version)).status,409)
    assert.equal((await send(admin,'pay',{...pay,amount:'99999',reference:'QA overpayment'},s.version)).status,400)
    assert.equal((await send(admin,'reopen',{reason:'QA forbidden after payment'},s.version)).status,409)
    await ok(await send(admin,'pay',{...pay,amount:'5721.38',reference:'QA fictitious final payment'},s.version))
    data=await load();assert.equal(data.statement.status,'paid');assert.equal(data.statement.paid_amount,'5821.38');assert.equal(data.payments_count,2)
  })
  await check('employee sees own payment history and notifications, peer sees neither',async()=>{
    const data=await load(first);assert.equal(data.payments_count,2);assert(data.events.length>=6)
    const events=await second.db.from('wf_payroll_events').select('id').eq('payroll_id',id);assert.ifError(events.error);assert.equal(events.data.length,0)
    const notifications=await first.request('/api/workforce/notifications');const body=await ok(notifications);assert(body.notifications.some(n=>n.kind==='payroll'))
    assert.equal((await first.request('/employee/finance/overview')).status,200);assert.equal((await admin.request('/admin/workforce/payroll')).status,200)
  })
  console.log(`PASS ${report.checks.length} monthly payroll groups`)
}finally{
  const cleanup=await service.from('wf_notifications').update({read_at:new Date().toISOString()}).like('event_key',`payroll:${id}:%`);assert.ifError(cleanup.error)
  await writeFile('.workforce-test/payroll-results.json',JSON.stringify(report,null,2))
}
