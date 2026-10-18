import {assertWorkforceTestTarget} from './workforce-test-target.mjs';
// Isolated QA tasks only. Uploaded objects stay private and audit evidence is archived, not deleted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const env=parse(await readFile('.env.local')),state=JSON.parse(await readFile('.workforce-test/accounts.json','utf8'));
const base=process.env.WORKFORCE_TEST_URL||'http://localhost:3100';assertWorkforceTestTarget(base);
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function session(account){
 const jar=new Map(),db=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
 const {error}=await db.auth.signInWithPassword({email:account.email,password:state.password});if(error)throw error;
 return {db,request:(path,options={})=>fetch(`${base}${path}`,{...options,headers:{Cookie:[...jar].map(([n,v])=>`${n}=${v}`).join('; '),...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}})};
}
const admin=await session(state.accounts.admin),a=await session(state.accounts.a),b=await session(state.accounts.b),client=await session(state.accounts.client);
const {data:staff,error}=await service.from('wf_employees').select('id,email,status').in('email',[state.accounts.a.email,state.accounts.b.email]);assert.ifError(error);assert.equal(staff.length,2);assert(staff.every(s=>s.status==='active'&&s.email.startsWith(state.prefix)));
const first=staff.find(s=>s.email===state.accounts.a.email),second=staff.find(s=>s.email===state.accounts.b.email);
const ids=[],label=`QA Attachments ${Date.now()}`,report={label,ids,checks:[]};
async function ok(response){const body=await response.json();assert(response.ok,`${response.status}: ${JSON.stringify(body)}`);return body;}
const cmd=(actor,id,command,payload,version=null,key=crypto.randomUUID(),scope='tasks')=>actor.request(`/api/workforce/${scope}`,{method:'POST',body:JSON.stringify({id,command,payload,version,request_key:key})});
const detail=async id=>ok(await admin.request(`/api/workforce/tasks/${id}`));
const list=async (actor,id,extra='')=>ok(await actor.request(`/api/workforce/tasks/${id}/attachments${extra}`));
async function create(owner){const id=crypto.randomUUID();ids.push(id);await ok(await cmd(admin,id,'create',{title:`${label} — اختبار دورة المرفقات`,client_name:label,assignee_id:owner,requires_approval:true,completion_criteria:'نتيجة العمل والملفات النهائية'}));return id;}
function upload(actor,task,name,bytes,key=crypto.randomUUID(),purpose='delivery',headers){const form=new FormData();form.set('file',new File([bytes],name));form.set('title',name);form.set('purpose',purpose);form.set('request_key',key);return actor.request(`/api/workforce/tasks/${task}/attachments`,{method:'POST',body:form,headers});}
const archive=(actor,id,archived=true)=>actor.request(`/api/workforce/attachments/${id}`,{method:'PATCH',body:JSON.stringify({archived})});
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);await writeFile('.workforce-test/attachments-results.json',JSON.stringify(report,null,2));}
await mkdir('.workforce-test/attachments',{recursive:true});
const image=sharp({create:{width:640,height:360,channels:3,background:{r:24,g:65,b:110}}});
const pdf=await PDFDocument.create(),page=pdf.addPage([500,300]),font=await pdf.embedFont(StandardFonts.Helvetica);page.drawText('QA delivery attachment - no real customer data',{x:20,y:200,size:16,font});
const samples={png:await image.clone().png().toBuffer(),jpg:await image.clone().jpeg().toBuffer(),webp:await image.clone().webp().toBuffer(),pdf:Buffer.from(await pdf.save()),txt:Buffer.from('QA only - test delivery'),csv:Buffer.from('item,value\nQA,1\n')};
function fixtureZip(part){
 const locals=[],centrals=[];let offset=0;
 for(const [filename,value]of [['[Content_Types].xml','<?xml version="1.0"?><Types/>'],[part,'QA fixture only']]){
  const name=Buffer.from(filename),bytes=Buffer.from(value);let crc=0xffffffff;
  for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,name,bytes);centrals.push(central,name);offset+=local.length+name.length+bytes.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}
for(const [ext,part]of Object.entries({docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml',zip:'hello.txt'}))samples[ext]=fixtureZip(part);
for(const [ext,bytes] of Object.entries(samples))await writeFile(`.workforce-test/attachments/sample.${ext}`,bytes);
try{
 const task=await create(first.id),other=await create(second.id);report.task=task;report.other=other;
 let files=[];
 await check('session, task ownership, public/client access and direct Storage/RPC/write denial',async()=>{
  assert.equal((await fetch(`${base}/api/workforce/tasks/${task}/attachments`)).status,401);
  assert.equal((await client.request(`/api/workforce/tasks/${task}/attachments`)).status,403);
  assert.equal((await list(b,task)).canUpload,false);
  assert.equal((await upload(b,task,'sample.txt',samples.txt)).status,403);
  assert.equal((await upload(a,other,'sample.txt',samples.txt)).status,403);
  assert.equal((await upload(a,task,'sample.txt',samples.txt,crypto.randomUUID(),'delivery',{Origin:'https://untrusted.invalid'})).status,403);
  assert((await a.db.rpc('wf_attachment_command',{p_actor:state.accounts.admin.id,p_id:crypto.randomUUID(),p_task:task,p_command:'add',p_payload:{}})).error);
  assert((await a.db.from('wf_task_attachments').insert({task_id:task})).error);
  assert((await a.db.from('wf_submission_attachments').insert({submission_id:crypto.randomUUID(),attachment_id:crypto.randomUUID()})).error);
  assert((await a.db.storage.from('workforce-task-files').upload(`${task}/unauthorized.txt`,samples.txt)).error);
 });
 await check('content validation, invalid extensions, damaged files, empty and oversize bodies',async()=>{
  for(const [name,bytes] of [['evil.svg',Buffer.from('<svg/>')],['fake.png',samples.txt],['fake.pdf',Buffer.from('%PDF- not valid')],['fake.docx',samples.txt],['binary.txt',Buffer.from([0,1,2])],['empty.txt',Buffer.alloc(0)],['large.txt',Buffer.alloc(4*1024*1024+1,65)]]){
   const r=await upload(a,task,name,bytes);assert([400,413].includes(r.status),`${name}: ${r.status}`);
  }
  assert.equal((await list(a,task)).count,0);
 });
 await check('all supported formats upload, preview/download headers and byte identity for task readers',async()=>{
  for(const [ext,bytes]of Object.entries(samples)){
   const file=await ok(await upload(a,task,`sample.${ext}`,bytes));files.push({...file,ext,bytes});
   const download=await b.request(`/api/workforce/attachments/${file.id}`);assert.equal(download.status,200);
   assert.equal(download.headers.get('cache-control'),'private, no-store');assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert(download.headers.get('content-disposition').startsWith('attachment;'));
   assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
   const preview=await a.request(`/api/workforce/attachments/${file.id}?preview=true`);assert.equal(preview.status,200);
   assert(preview.headers.get('content-disposition').startsWith(['png','jpg','webp','pdf'].includes(ext)?'inline;':'attachment;'));await preview.arrayBuffer();
  }
  assert.equal((await list(a,task)).count,Object.keys(samples).length);
  assert.equal((await fetch(`${base}/api/workforce/attachments/${files[0].id}`)).status,401);
  assert.equal((await client.request(`/api/workforce/attachments/${files[0].id}`)).status,403);
  assert.equal((await archive(b,files[0].id)).status,403);
  const saved=await service.from('wf_task_attachments').select('object_path').eq('id',files[0].id).single();assert.ifError(saved.error);
  assert((await a.db.storage.from('workforce-task-files').download(saved.data.object_path)).error);
  assert((await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/workforce-task-files/${saved.data.object_path}`)).status!==200);
 });
 await check('concurrent identical retries create one row/event/object; changed bytes reject key reuse',async()=>{
  const key=crypto.randomUUID();await Promise.all([upload(a,task,'retry.txt',samples.txt,key),upload(a,task,'retry.txt',samples.txt,key)].map(async p=>ok(await p)));
  const retry=await ok(await upload(a,task,'retry.txt',samples.txt,key));assert.equal(retry.id,key);
  assert.equal((await upload(a,task,'retry.txt',Buffer.from('different'),key)).status,409);
  const rows=await service.from('wf_task_attachments').select('id,object_path').eq('task_id',task);assert.ifError(rows.error);
  const objects=await service.storage.from('workforce-task-files').list(task,{limit:200});assert.ifError(objects.error);assert.equal(objects.data.length,rows.data.length);
  const events=await service.from('wf_task_events').select('id').eq('task_id',task).eq('action','attachment:add');assert.ifError(events.error);assert.equal(events.data.length,rows.data.length);
 });
 await check('archive/restore ownership, pagination and admin reference protection',async()=>{
  await ok(await archive(a,files[2].id));assert.equal((await list(a,task)).count,10);assert.equal((await list(a,task,'?archived=true')).count,11);
  await ok(await archive(a,files[2].id,false));
  const reference=await ok(await upload(admin,task,'admin-reference.txt',samples.txt,crypto.randomUUID(),'task'));report.adminFile=reference.id;
  assert.equal((await archive(a,reference.id)).status,403);
  await ok(await archive(admin,reference.id));await ok(await archive(admin,reference.id,false));
  for(let i=0;i<10;i++)await ok(await upload(a,task,`page-${i}.txt`,samples.txt));
  assert.equal((await list(a,task)).attachments.length,20);assert.equal((await list(a,task,'?page=2')).attachments.length,2);
 });
 await check('checklist/blocker enforcement, invalid links rollback, submit snapshot and review freeze',async()=>{
  const item=crypto.randomUUID();let d=await detail(task);
  await ok(await cmd(admin,task,'add',{item_id:item,title:'دليل التسليم مطلوب',required:true},d.task.version,crypto.randomUUID(),'checklist'));
  d=await detail(task);assert.equal((await cmd(a,task,'submit',{summary:'محاولة قبل إكمال المتطلبات',attachment_ids:[files[0].id]},d.task.version)).status,409);
  await ok(await cmd(a,task,'toggle',{item_id:item,completed:true},d.task.version,crypto.randomUUID(),'checklist'));
  d=await detail(task);await ok(await cmd(a,task,'block',{reason:'عائق اختبار قبل التسليم'},d.task.version));
  d=await detail(task);assert.equal((await cmd(a,task,'submit',{summary:'محاولة قبل معالجة العائق',attachment_ids:[]},d.task.version)).status,409);
  await ok(await cmd(a,task,'block',{reason:''},d.task.version));d=await detail(task);
  const foreign=await ok(await upload(b,other,'other.txt',samples.txt));report.foreignFile=foreign.id;
  for(const selected of [[foreign.id],[crypto.randomUUID()],[files[0].id,files[0].id]])assert.equal((await cmd(a,task,'submit',{summary:'قائمة ملفات غير صحيحة',attachment_ids:selected},d.task.version)).status,409);
  assert.equal((await detail(task)).latestSubmission,null);
  const key=crypto.randomUUID(),payload={summary:'تسليم اختبار موثق بصورة وملف PDF',attachment_ids:[files[0].id,files[3].id]};
  await ok(await cmd(a,task,'submit',payload,d.task.version,key));await ok(await cmd(a,task,'submit',payload,d.task.version,key));
  d=await detail(task);report.firstSubmission=d.latestSubmission.id;
  assert.equal((await list(admin,task,`?submission_id=${d.latestSubmission.id}`)).count,2);
  assert((await list(a,task)).attachments.filter(f=>payload.attachment_ids.includes(f.id)).every(f=>f.sealed));
  assert.equal((await upload(a,task,'late.txt',samples.txt)).status,409);assert.equal((await upload(admin,task,'late.txt',samples.txt)).status,409);assert.equal((await archive(admin,files[0].id)).status,409);
  assert.equal((await cmd(b,task,'review',{decision:'approved',reason:'غير مسموح'},d.task.version)).status,403);
 });
 await check('changes, second delivery, approval, history, notifications and financial privacy',async()=>{
  let d=await detail(task);await ok(await cmd(admin,task,'review',{decision:'changes',reason:'أضف النسخة النهائية مع الاحتفاظ بالأولى'},d.task.version));
  assert.equal((await archive(a,files[0].id)).status,409);
  const final=await ok(await upload(a,task,'final.pdf',samples.pdf));report.finalFile=final.id;
  d=await detail(task);await ok(await cmd(a,task,'submit',{summary:'النسخة النهائية بعد طلب التعديل',attachment_ids:[final.id]},d.task.version));
  d=await detail(task);report.finalSubmission=d.latestSubmission.id;
  await ok(await cmd(admin,task,'review',{decision:'approved',reason:'تمت مراجعة المرفقات واعتماد النتيجة'},d.task.version));
  assert.equal((await detail(task)).task.column.kind,'done');
  assert.equal((await list(b,task,`?submission_id=${report.firstSubmission}`)).count,2);
  assert.deepEqual((await list(b,task,`?submission_id=${report.finalSubmission}`)).attachments.map(f=>f.id),[final.id]);
  const history=await ok(await a.request(`/api/workforce/tasks/${task}/history?kind=submissions`));assert.equal(history.count,2);assert.equal(history.submissions[0].status,'approved');assert.equal(history.submissions[1].status,'changes');
  const notifications=await service.from('wf_notifications').select('kind,recipient_id').eq('task_id',task);assert.ifError(notifications.error);assert(notifications.data.some(n=>n.kind==='submitted'&&n.recipient_id===state.accounts.admin.id));assert(notifications.data.some(n=>n.recipient_id===state.accounts.a.id));assert(!notifications.data.some(n=>n.recipient_id===state.accounts.b.id));
  assert.equal((await b.request(`/api/workforce/employees/${first.id}/payroll?month=2026-10`)).status,404);
  assert.equal((await a.request(`/api/workforce/employees/${second.id}/payroll?month=2026-10`)).status,404);
  assert.equal((await list(a,task)).canUpload,false);
 });
 await check('reassignment and employee suspension revoke writes/reads with existing session',async()=>{
  let d=await detail(other);await ok(await cmd(admin,other,'edit',{assignee_id:first.id},d.task.version));
  assert.equal((await upload(b,other,'former-owner.txt',samples.txt)).status,403);await ok(await upload(a,other,'new-owner.txt',samples.txt));
  const suspended=await service.from('wf_employees').update({status:'suspended'}).eq('id',second.id);assert.ifError(suspended.error);
  try{
   assert.equal((await b.request(`/api/workforce/attachments/${files[0].id}`)).status,403);
   const hidden=await b.db.from('wf_task_attachments').select('id').eq('task_id',task);assert.ifError(hidden.error);assert.equal(hidden.data.length,0);
  }finally{assert.ifError((await service.from('wf_employees').update({status:'active'}).eq('id',second.id)).error);}
 });
 console.log(`PASS ${report.checks.length} attachment workflow groups`);
}finally{
 if(!process.argv.includes('--keep')){
  assert.ifError((await service.from('wf_tasks').update({archived_at:new Date().toISOString(),updated_by:state.accounts.admin.id}).in('id',ids).eq('created_by',state.accounts.admin.id)).error);
  assert.ifError((await service.from('wf_notifications').update({read_at:new Date().toISOString()}).in('task_id',ids)).error);
 }
 await writeFile('.workforce-test/attachments-results.json',JSON.stringify(report,null,2));
}
