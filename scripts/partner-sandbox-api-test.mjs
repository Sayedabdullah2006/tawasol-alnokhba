import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import ts from 'typescript'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createNukhbaClient } from '../docs/partners/client.mjs'

dotenv.config({ path: '.env.local', quiet: true })
const realRequire = createRequire(import.meta.url)
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Database test configuration required')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const testId = `awwal-saudi-qa-${crypto.randomUUID()}`
const customer = 'customer-one'; const otherCustomer = 'customer-two'
const secret = crypto.randomBytes(32).toString('hex')
const publisher = 'a91880b6-2252-4aa7-807d-a53eb734771f'
process.env.PARTNER_API_CLIENTS_JSON = JSON.stringify([{ id: testId, keys: { test: secret }, influencer_ids: [publisher], return_url: 'https://example.invalid/orders/return' }])
process.env.PARTNER_CHECKOUT_SECRET = crypto.randomBytes(32).toString('hex')
process.env.PARTNER_CHECKOUT_BASE_URL = 'https://nukhba.media'
process.env.PARTNER_PAYMENT_MODE = 'live'
process.env.MOYASAR_SECRET_KEY = 'sk_live_mock_only'
process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY = 'pk_live_mock_only'
process.env.PARTNER_MOYASAR_TEST_SECRET_KEY='sk_test_mock_only';process.env.PARTNER_MOYASAR_TEST_PUBLISHABLE_KEY='pk_test_mock_only';
const sandboxClient={id:testId,keys:{test:secret},influencer_ids:[publisher],return_url:'https://first1saudi.net/services/orders/return',notifications:false,auto_studio:false,sandbox_only:true,expires_at:new Date(Date.now()+3600000).toISOString()};
process.env.PARTNER_API_CLIENTS_JSON='[]';process.env.PARTNER_SANDBOX_CLIENTS_JSON=JSON.stringify([sandboxClient]);
// Provider responses are simulated. This script never creates a payment or sends real mail.
let providerPayment = null; let notificationCount = 0; let studioCount = 0; let verifiedTestKey = false
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const result = {}; cache.set(file, result)
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const scope = {
    fetch: async (url, options) => {
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from("sk_test_mock_only:").toString("base64")}`); verifiedTestKey = true;
      assert(String(url).startsWith('https://api.moyasar.com/v1/payments/'), 'Unexpected provider request')
      return Response.json(providerPayment)
    },
    require(name) {
      if (name === 'server-only') return {}
      if (name === '@/lib/supabase-server') return { createServiceRoleClient: async () => db }
      if (name === '@/lib/email') return { notifyPaymentConfirmedToClient: async () => { notificationCount++ }, notifyContentApprovedToAdmin: async () => {}, notifyContentChangesRequested: async () => {} }
      if (name === '@/lib/auto-studio') return { autoRunRequestStudio: async () => { studioCount++ } }
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`))
      return realRequire(name)
    },
  }; vm.runInThisContext('(function(exports, require, fetch){'+compiled+'\n})', {filename:file})(result,scope.require,scope.fetch)
  return result
}

const {GET,POST}=load('src/app/api/partners/v1/[...path]/route.ts');const auth=load('src/lib/partners/auth.ts');const checkout=load('src/lib/partners/checkout.ts');
let checks = 0
async function call(target, { method = 'GET', body, who = customer, key = crypto.randomUUID(), nonce = crypto.randomUUID(), timestamp = String(Math.floor(Date.now()/1000)), mutateSignature = false } = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body)
  const url = `/api/partners/v1/${target}`
  const signature = crypto.createHmac('sha256', secret).update(auth.canonicalRequest(method, url, timestamp, nonce, who, method === 'POST' ? key : '', raw)).digest('hex')
  const headers = { 'x-partner-id': testId, 'x-key-id': 'test', 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-customer-id': who, 'x-signature': mutateSignature ? '0'.repeat(64) : signature, ...(method === 'POST' ? { 'idempotency-key': key, 'content-type': 'application/json' } : {}) }
  const request = new Request(`https://nukhba.media${url}`, { method, headers, ...(method === 'POST' ? { body: raw || '{}' } : {}) })
  const response = await (method === 'POST' ? POST : GET)(request, { params: Promise.resolve({ path: target.split('?')[0].split('/') }) })
  const result = await response.json(); checks++
  return { status: response.status, ...result }
}
let filePath;let ids=[];
try {
 const catalog=await call('catalog');assert.equal(catalog.status,200);assert.equal(catalog.data.packages.length,5);assert.equal(Object.keys(catalog.data.status_definitions.request).length,19);
 const quote=await call('quotes',{method:'POST',body:{package_id:'v2_basic',category:'graduation',influencer_id:publisher,channels:['x']}});assert.equal(quote.status,200,JSON.stringify(quote));
 const body={quote_id:quote.data.id,title:'Isolated acceptance QA',content:'Synthetic acceptance content',customer:{name:'QA Customer',email:'qa@example.invalid',phone:'0500000000',city:'Test'}};
 const key=crypto.randomUUID();const first=await call('orders',{method:'POST',body,key});assert.equal(first.status,200,JSON.stringify(first));const id=first.data.id;ids.push(id);
 const replay=await call('orders',{method:'POST',body,key});assert.equal(replay.data.id,id);assert.equal(replay.data.replayed,true);
 assert.equal((await db.from('publish_requests').select('id').eq('id',id)).data.length,0);
 assert.equal((await call(`orders/${id}/state`,{who:otherCustomer})).status,404);assert.equal((await call(`orders/${id}/invoice`,{who:otherCustomer})).status,404);
 const [a,b]=await Promise.all([call(`orders/${id}/checkout`,{method:'POST',body:{}}),call(`orders/${id}/checkout`,{method:'POST',body:{}})]);assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.data.checkout_url,b.data.checkout_url);
 const token=new URLSearchParams(new URL(a.data.checkout_url).hash.slice(1)).get('token'),session=await checkout.checkoutSession(token);assert.equal(session.payment_mode,'sandbox');assert.equal(session.sandbox,true);assert.equal(new URL(session.return_url).pathname,'/services/orders/return');assert.equal(new URL(session.return_url).searchParams.get('order_id'),id);
 providerPayment={id:'qa_payment_'+crypto.randomUUID(),status:'failed',amount:session.amount,currency:'SAR',metadata:{resource_type:'partner_order',request_id:id,partner_checkout_id:session.id}};
 assert.equal((await checkout.settlePartnerPayment(providerPayment.id,session.id)).paid,false);assert(verifiedTestKey);
 const savedKey=process.env.PARTNER_MOYASAR_TEST_SECRET_KEY;delete process.env.PARTNER_MOYASAR_TEST_SECRET_KEY;await assert.rejects(checkout.settlePartnerPayment(providerPayment.id,session.id),/PAYMENT_MODE_NOT_CONFIGURED/);process.env.PARTNER_MOYASAR_TEST_SECRET_KEY=savedKey;
 providerPayment.status='paid';providerPayment.amount=1;await assert.rejects(checkout.settlePartnerPayment(providerPayment.id,session.id));providerPayment.amount=session.amount;
 const settle=await Promise.all([checkout.settlePartnerPayment(providerPayment.id,session.id),checkout.settlePartnerPayment(providerPayment.id,session.id)]);assert.equal(settle.filter(x=>x.applied).length,1);assert.equal(notificationCount,0);assert.equal(studioCount,0);
 assert.equal((await db.from('partner_payment_receipts').select('payment_id').eq('payment_id',providerPayment.id)).data.length,0);
 const state=await call(`orders/${id}/state`);assert.equal(state.data.payment_status,'paid');assert.equal(state.data.status,'in_progress');
 const information=await db.from('partner_sandbox_orders').update({status:'info_requested',admin_info_request:'QA only'}).eq('id',id);assert.ifError(information.error);
 assert.equal((await call(`orders/${id}/information`,{method:'POST',body:{content:'Updated synthetic details'}})).status,200);
 const prepared=await db.from('partner_sandbox_orders').update({status:'content_review',proposed_content:'QA proposed content',proposed_images:[],content_sent_at:new Date().toISOString()}).eq('id',id);assert.ifError(prepared.error);
 let detail=await call(`orders/${id}`);assert.equal((await call(`orders/${id}/review`,{method:'POST',body:{action:'changes',content_revision:detail.data.content_revision,feedback:'QA edit'}})).status,200);
 await db.from('partner_sandbox_orders').update({status:'content_review',content_sent_at:new Date().toISOString()}).eq('id',id);detail=await call(`orders/${id}`);assert.equal((await call(`orders/${id}/review`,{method:'POST',body:{action:'approve',content_revision:detail.data.content_revision}})).status,200);
 const pdf=Buffer.from('%PDF-1.4\nQA fixture upload');const reserve=await call(`orders/${id}/files`,{method:'POST',body:{name:'qa.pdf',mime_type:'application/pdf',size:pdf.length}});assert.equal(reserve.status,200);const file=await db.from('partner_sandbox_files').select('path').eq('id',reserve.data.id).single();filePath=file.data.path;
 assert.ifError((await db.storage.from('partner-sandbox-files').upload(filePath,pdf,{contentType:'application/pdf'})).error);
 assert.equal((await call(`orders/${id}/files/${reserve.data.id}/complete`,{method:'POST',body:{}})).status,200);detail=await call(`orders/${id}`);assert(detail.data.files[0].url.includes('partner-sandbox-files'));
 const client=createNukhbaClient({origin:'https://nukhba.media',partnerId:testId,keyId:'test',secret});const original=globalThis.fetch;try{globalThis.fetch=async(input,options)=>{const u=new URL(input);if(!u.pathname.startsWith('/api/partners/v1/'))return original(input,options);return GET(new Request(u,options),{params:Promise.resolve({path:u.pathname.slice('/api/partners/v1/'.length).split('/')})})};const pdf1=await client(`orders/${id}/invoice`,{customerId:customer,responseType:'pdf'}),pdf2=await client(`orders/${id}/invoice`,{customerId:customer,responseType:'pdf'});assert.equal(Buffer.from(pdf1.bytes).subarray(0,5).toString(),'%PDF-');assert(pdf1.filename.startsWith('SANDBOX-'));assert.deepEqual(pdf1.bytes,pdf2.bytes);fs.mkdirSync('output/partners/sandbox-qa',{recursive:true});fs.writeFileSync('output/partners/sandbox-qa/acceptance.pdf',pdf1.bytes)}finally{globalThis.fetch=original}
 assert.equal((await db.from('service_invoices').select('id').eq('request_id',id)).data.length,0);
 process.env.MOYASAR_WEBHOOK_SECRET=crypto.randomBytes(24).toString('hex');const hook=load('src/app/api/webhooks/moyasar/route.ts');const hookBody={id:crypto.randomUUID(),type:'payment_paid',secret_token:process.env.MOYASAR_WEBHOOK_SECRET,data:{id:providerPayment.id,metadata:providerPayment.metadata}};const sendHook=body=>hook.POST(new Request('https://nukhba.media/api/webhooks/moyasar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));assert.equal((await sendHook({...hookBody,secret_token:'invalid'})).status,401);assert.equal((await sendHook(hookBody)).status,200);assert.equal((await sendHook(hookBody)).status,200);assert.equal(notificationCount,0);assert.equal(studioCount,0);assert.equal((await db.from('webhook_logs').select('id').eq('payment_id',providerPayment.id)).data.length,0);
 process.env.PARTNER_SANDBOX_CLIENTS_JSON=JSON.stringify([{...sandboxClient,expires_at:'2020-01-01'}]);assert.equal((await call('catalog')).status,401);await assert.rejects(checkout.checkoutSession(token));
 process.env.PARTNER_SANDBOX_CLIENTS_JSON=JSON.stringify([{...sandboxClient,notifications:true}]);assert.equal((await call('catalog')).status,503);process.env.PARTNER_SANDBOX_CLIENTS_JSON=JSON.stringify([sandboxClient]);
 fs.writeFileSync('output/partners/sandbox-qa/result.json',JSON.stringify({passed:true,http_checks:checks,separate_orders:true,separate_files:true,separate_receipts:true,central_states:true,order_idempotency:true,checkout_idempotency:true,settlement_idempotency:true,test_key_verification:true,missing_test_keys_rejected:true,expired_partner_rejected:true,invalid_partner_rejected:true,ownership:true,information:true,review_changes_and_approval:true,original_test_pdf_reused:true,no_production_invoice:true,notifications:notificationCount,studio:studioCount,webhook_replay:true,no_production_webhook_log:true,provider_simulated:true,no_real_charge:true},null,2));console.log(`PASS: ${checks} isolated Sandbox API checks`)
}finally{
 if(filePath)await db.storage.from('partner-sandbox-files').remove([filePath]);
 if(ids.length){for(const t of ['partner_sandbox_invoices','partner_sandbox_payment_receipts','partner_sandbox_files','partner_sandbox_checkout_sessions'])await db.from(t).delete().in('request_id',ids)}
 await db.from('partner_sandbox_quotes').delete().eq('partner_id',testId);await db.from('partner_sandbox_orders').delete().eq('partner_id',testId);await db.from('partner_nonces').delete().eq('partner_id',testId);
}
