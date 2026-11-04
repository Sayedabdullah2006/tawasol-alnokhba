// Isolated signed HTTP tests. No live customer, payment, or fiscal invoice is created.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import ts from 'typescript'
import {PDFDocument} from 'pdf-lib'
import {createNukhbaClient} from '../docs/partners/client.mjs'

const require=createRequire(import.meta.url),secret=crypto.randomBytes(32).toString('hex')
const partner='qa-invoice',customer='customer-one',id=crypto.randomUUID(),nonces=new Set()
const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save()
process.env.PARTNER_API_CLIENTS_JSON=JSON.stringify([{id:partner,keys:{test:secret}}])
const row={id,partner_id:partner,external_customer_id:customer,payment_status:'paid',paid_at:new Date().toISOString(),status:'in_progress',final_total:799}
let generated=0,storageFailure=false,queryFailure=false,useRealInvoice=false,invoiceFixture,uploads=0
const stored=new Map()
const db={rpc:async(_,args)=>{const key=args.p_partner+args.p_nonce;if(nonces.has(key))return {data:false};nonces.add(key);return {data:true}},from(table){if(table==='service_invoices')return {select(){return this},eq(){return this},maybeSingle:async()=>({data:invoiceFixture,error:null}),update(values){Object.assign(invoiceFixture,values);return {eq:async()=>({error:null})}}};assert.equal(table,'publish_requests');const filters={};return {select(){return this},eq(k,v){filters[k]=v;return this},async maybeSingle(){assert.deepEqual(Object.keys(filters).sort(),['external_customer_id','id','partner_id']);return {data:Object.entries(filters).every(([k,v])=>row[k]===v)?row:null,error:queryFailure?{message:'private database details'}:null}}}}}
db.storage={from(bucket){assert.equal(bucket,'service-invoices');return {upload:async(key,pdf)=>{uploads++;stored.set(key,Buffer.from(pdf));return {error:null}},download:async key=>({data:stored.has(key)?new Blob([stored.get(key)]):null,error:null})}}}
const cache=new Map()
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const env={require(name){
  if(name==='@/lib/supabase-server')return {createServiceRoleClient:async()=>db}
  if(name==='server-only')return {}
  if(name==='@/lib/service-invoice'&&useRealInvoice)return load('src/lib/service-invoice.ts')
  if(name==='@/lib/service-invoice')return {ensureServiceInvoice:async(requestId)=>{assert.equal(requestId,id);if(useRealInvoice)return load('src/lib/service-invoice.ts').ensureServiceInvoice(requestId);generated++;if(storageFailure)throw Error('sensitive storage information');return {pdf:bytes,filename:'QA-INVOICE.pdf'}}}
  if(name==='@/lib/partners/service')return {partnerOperation:async()=>{throw Error('Invoice path must not reach ordinary JSON operations')}}
  if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts')
  if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'))
  return require(name)
 }};vm.runInThisContext('(function(exports, require){'+compiled+'\n})',{filename:file})(exports,env.require);return exports}
const {GET}=load('src/app/api/partners/v1/[...path]/route.ts'),{canonicalRequest}=load('src/lib/partners/auth.ts')
let checks=0
async function request({who=customer,partnerId=partner,targetId=id,nonce=crypto.randomUUID(),bad=false}={}){const target=`/api/partners/v1/orders/${targetId}/invoice`,timestamp=String(Math.floor(Date.now()/1000));const signature=crypto.createHmac('sha256',secret).update(canonicalRequest('GET',target,timestamp,nonce,who,'','')).digest('hex');checks++;return GET(new Request('https://nukhba.media'+target,{headers:{'X-Partner-ID':partnerId,'X-Key-ID':'test','X-Customer-ID':who,'X-Timestamp':timestamp,'X-Nonce':nonce,'X-Signature':bad?'0'.repeat(64):signature}}),{params:Promise.resolve({path:['orders',targetId,'invoice']})})}
let r=await request();assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert(r.headers.get('cache-control').includes('private, no-store'));assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('x-trace-id'),/^[a-f0-9-]{36}$/);assert.equal(r.headers.get('content-disposition'),'attachment; filename="QA-INVOICE.pdf"');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes)
assert.equal((await request({who:'customer-two'})).status,404);row.partner_id='different-partner';assert.equal((await request()).status,404);row.partner_id=partner
assert.equal((await request({targetId:crypto.randomUUID()})).status,404);assert.equal((await request({targetId:'invalid'})).status,400);assert.equal((await request({bad:true})).status,401)
const nonce=crypto.randomUUID();assert.equal((await request({nonce})).status,200);assert.equal((await request({nonce})).status,409)
row.payment_status='unpaid';row.paid_at=null;row.moyasar_payment_id='checkout-is-not-payment';const before=generated;r=await request();assert.equal(r.status,409);assert.equal((await r.json()).error.code,'INVOICE_NOT_AVAILABLE');assert.equal(generated,before)
row.payment_status='paid';row.final_total=0;assert.equal((await request()).status,409);row.final_total=799
row.payment_status='refunded';row.status='refunded';row.paid_at=new Date().toISOString();assert.equal((await request()).status,200)
storageFailure=true;r=await request();assert.equal(r.status,503);assert.equal((await r.json()).error.code,'INVOICE_UNAVAILABLE');storageFailure=false
queryFailure=true;assert.equal((await request()).status,503);queryFailure=false
const originalFetch=globalThis.fetch
try{globalThis.fetch=async(input,options)=>{checks++;const url=new URL(input);return GET(new Request(url,options),{params:Promise.resolve({path:url.pathname.slice('/api/partners/v1/'.length).split('/')})})};const api=createNukhbaClient({origin:'https://nukhba.media',partnerId:partner,keyId:'test',secret});const invoice=await api(`orders/${id}/invoice`,{customerId:customer,responseType:'pdf'});assert.equal(invoice.filename,'QA-INVOICE.pdf');assert.deepEqual(invoice.bytes,bytes);await assert.rejects(api(`orders/${id}/invoice`,{customerId:'other',responseType:'pdf'}),e=>e.status===404&&e.message==='ORDER_NOT_FOUND');await assert.rejects(api(`orders/${id}/invoice`,{customerId:customer}),/responseType/)}finally{globalThis.fetch=originalFetch}
useRealInvoice=true;const central=load('src/lib/service-invoice.ts');invoiceFixture={id:crypto.randomUUID(),request_id:id,invoice_number:'QA-INVOICE-TEST',pdf_path:null,template_version:4,snapshot:central.createServiceInvoiceSnapshot({...row,title:'Synthetic invoice test',request_number:1,category:'graduation',client_name:'QA Customer',client_email:'qa@example.invalid',source_site:'awwal-saudi'}, {})};await central.ensureServiceInvoice(id);r=await request();assert.equal(r.status,200);const actual=new Uint8Array(await r.arrayBuffer());assert.equal(Buffer.from(actual).subarray(0,5).toString(),'%PDF-');const parsed=await PDFDocument.load(actual);assert.equal(parsed.getAuthor(),'Tawasol Alnokhba Advertising Company');const again=await request();assert.deepEqual(new Uint8Array(await again.arrayBuffer()),actual);assert.equal(uploads,1,'Repeat download must reuse the original stored central PDF');
fs.mkdirSync('output/partners/invoice-qa',{recursive:true});fs.writeFileSync('output/partners/invoice-qa/result.json',JSON.stringify({passed:true,http_checks:checks,signed_auth:true,ownership:true,payment_gate:true,replay_protection:true,pdf_response:true,central_pdf_generated:true,stored_pdf_reused:true,sdk:true,sanitized_errors:true,live_payment_created:false,live_fiscal_invoice_created:false},null,2));console.log(`PASS: ${checks} signed invoice HTTP checks; no live payment or fiscal invoice created`)
