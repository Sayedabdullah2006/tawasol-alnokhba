import test from 'node:test';import assert from 'node:assert/strict';import{registerHooks}from'node:module';
test('mail worker sends one employee recipient and manager CC using mocked transport only',async()=>{
 const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;let handler,requestBody,finished;
 const snapshot={email:'staff@example.com',name:'الموظفة',kind:'weekly_report',title:'تقرير الأسبوع',href:'/employee',createdAt:'2026-10-24T06:00:00Z',cc:['elitecnnct@gmail.com'],weeklyReport:{periodStart:'2026-10-17',periodEnd:'2026-10-23',asOf:'2026-10-23T21:00:00Z',month:'2026-10',completed:1,unfinished:0,pendingReview:0,overdue:0,onTime:1,lateSubmissions:0,changesCount:0,repeatedChanges:0,weekWorkedMinutes:2880,weekRequiredMinutes:2880,monthWorkedMinutes:2880,openTasks:[]}};
 globalThis.__weeklyMockDB={rpc:async(name,args)=>{
  if(name==='wf_validate_notification_worker')return{data:true};
  if(name==='wf_claim_notification_deliveries')return{data:{token:'mock-token',deliveries:[{id:'mock-delivery',snapshot}]}};
  if(name==='wf_finish_notification_delivery'){finished=args;return{data:true};}
  if(name==='wf_release_notification_worker')return{data:null};
  throw Error('Unexpected RPC: '+name);
 }};
 const hooks=registerHooks({resolve(specifier,context,next){if(specifier.startsWith('npm:@supabase/supabase-js'))return{url:'data:text/javascript,export const createClient=()=>globalThis.__weeklyMockDB;',shortCircuit:true};return next(specifier,context);}});
 globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'https://example.invalid': 'offline-mock-key-0000000000000000000000'},serve:fn=>{handler=fn;}};
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');requestBody=JSON.parse(options.body);return Response.json({id:'mock-receipt'});};
 try{
  await import('../supabase/functions/workforce-notifications/index.ts');
  const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'x-workforce-secret':'offline-mock-key-0000000000000000000000'}}));
  assert.equal(response.status,200);assert.deepEqual(requestBody.to,['staff@example.com']);assert.deepEqual(requestBody.cc,['elitecnnct@gmail.com']);assert.equal(finished.p_result,'sent');assert.match(requestBody.html,/logo.png/);
 }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;delete globalThis.__weeklyMockDB;hooks.deregister();}
});
