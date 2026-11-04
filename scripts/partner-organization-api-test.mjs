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
const ids=[],paths=[];const dc='QAORG'+crypto.randomBytes(6).toString('hex').toUpperCase();const check=r=>{assert.ifError(r.error);return r.data};
const orgBody=(type='business')=>({client_type:type,request_type:'single',influencer_id:publisher,category:type==='government'?'government':'product',org_name:type==='government'?'جهة حكومية تجريبية':'شركة تجريبية',org_representative:'ممثل تجريبي',org_license:'QA-ONLY',channels:['x'],title:'طلب جهة معزول',content:'محتوى تجريبي لا ينشر.',customer:{name:'QA Contact',email:'qa@example.invalid',phone:'0500000000',city:'Test'}});
async function create(type,who){const r=await call('orders',{method:'POST',who,body:orgBody(type)});assert.equal(r.status,200,JSON.stringify(r));ids.push(r.data.id);return r.data.id}
async function quote(id,price=1000,expired=false){check(await db.from('partner_sandbox_orders').update({status:'quoted',admin_quoted_price:price,final_total:price,admin_offered_extras:[{id:'mention',name:'إشارة لحساب الجهة',price:200,reachBoost:0}],quote_expires_at:new Date(Date.now()+(expired?-3600000:86400000)).toISOString(),quoted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id))}
async function offer(id,who){const r=await call(`orders/${id}/offer`,{who});assert.equal(r.status,200,JSON.stringify(r));return r.data}
try{
 const cat=await call('catalog');assert.equal(cat.status,200);assert.equal(cat.data.packages.length,5);assert.equal(cat.data.client_types.find(t=>t.id==='business').pricing_mode,'manual');assert.deepEqual(Array.from(cat.data.categories_by_client_type.government,c=>c.id),['appointment','government']);assert.deepEqual(Array.from(cat.data.categories_by_client_type.business,c=>c.id),['appointment','product']);assert(cat.data.content_requirements.category_conditions.government);
 assert.equal((await call('quotes',{method:'POST',body:{client_type:'government'}})).status,409);
 for(const patch of [{client_type:'agency'},{org_name:''},{category:'graduation'},{category:'government'},{amount:1},{status:'approved'},{quote_id:crypto.randomUUID()},{request_type:'campaign'},{channels:['x','x']},{sub_option:'fake'}])assert.equal((await call('orders',{method:'POST',body:{...orgBody(),...patch}})).status,400,JSON.stringify(patch));
 const key=crypto.randomUUID(),body=orgBody();const pair=await Promise.all([call('orders',{method:'POST',key,body}),call('orders',{method:'POST',key,body})]);assert(pair.every(r=>r.status===200),JSON.stringify(pair));const id=pair[0].data.id;ids.push(id);assert.equal(pair[1].data.id,id);assert.equal(pair[0].data.amount,null);assert.equal((await call('orders',{method:'POST',key,body:{...body,title:'conflict'}})).status,409);
 let row=await call(`orders/${id}`);assert.equal(row.data.status,'pending');assert.equal(row.data.amount,null);assert.equal(row.data.org_name,body.org_name);assert.equal(row.data.client_type,'business');assert.equal(row.data.user_id,undefined);assert.equal((await offer(id)).available,false);assert.equal((await call(`orders/${id}/checkout`,{method:'POST',body:{}})).status,409);
 assert.equal((await call(`orders/${id}/offer`,{who:otherCustomer})).status,404);assert.equal((await call(`orders/${id}/offer`,{method:'POST',who:otherCustomer,body:{action:'accept',offer_revision:'x'.repeat(64)}})).status,404);
 const bytes=Buffer.from('%PDF-1.4\nSynthetic government letter');const reserved=await call(`orders/${id}/files`,{method:'POST',body:{name:'authority.pdf',mime_type:'application/pdf',size:bytes.length}});assert.equal(reserved.status,200,JSON.stringify(reserved));const f=check(await db.from('partner_sandbox_files').select('path').eq('id',reserved.data.id).single());paths.push(f.path);check(await db.storage.from('partner-sandbox-files').upload(f.path,bytes,{contentType:'application/pdf'}));assert.equal((await call(`orders/${id}/files/${reserved.data.id}/complete`,{method:'POST',body:{}})).status,200);
 await quote(id);let financial=await offer(id);assert.equal(financial.base_amount,100000);assert.equal(financial.offered_extras[0].price,20000);
 check(await db.from('partner_sandbox_discounts').insert({code:dc,discount_pct:10,max_discount_amount:100,max_uses:1,used_count:0,is_active:true,expires_at:new Date(Date.now()+86400000).toISOString()}));
 const selection={selected_extras:['mention'],discount_code:dc,offer_revision:financial.offer_revision};const preview=await call(`orders/${id}/offer`,{method:'POST',body:{action:'preview',...selection}});assert.equal(preview.status,200);assert.equal(preview.data.amount,110000);assert.equal(check(await db.from('partner_sandbox_discounts').select('used_count').eq('code',dc).single()).used_count,0);
 const acceptanceKey=crypto.randomUUID(),acceptance={action:'accept',...selection};const accepted=await Promise.all([call(`orders/${id}/offer`,{method:'POST',key:acceptanceKey,body:acceptance}),call(`orders/${id}/offer`,{method:'POST',key:acceptanceKey,body:acceptance})]);assert(accepted.every(r=>r.status===200),JSON.stringify(accepted));assert(accepted.every(r=>r.data.amount===110000));assert.equal(check(await db.from('partner_sandbox_discounts').select('used_count').eq('code',dc).single()).used_count,1);assert.equal((await call(`orders/${id}/offer`,{method:'POST',key:acceptanceKey,body:acceptance})).status,200);
 const pay=await call(`orders/${id}/checkout`,{method:'POST',body:{}});assert.equal(pay.status,200);const token=new URLSearchParams(new URL(pay.data.checkout_url).hash.slice(1)).get('token'),session=await checkout.checkoutSession(token);assert.equal(session.amount,110000);assert.equal(session.payment_mode,'sandbox');financial=await offer(id);assert.equal((await call(`orders/${id}/offer`,{method:'POST',body:{action:'accept',offer_revision:financial.offer_revision,selected_extras:[]}})).status,409);
 providerPayment={id:'qa_org_payment_'+crypto.randomUUID(),status:'paid',amount:110000,currency:'SAR',metadata:{resource_type:'partner_order',request_id:id,partner_checkout_id:session.id}};const settlements=await Promise.all([checkout.settlePartnerPayment(providerPayment.id,session.id),checkout.settlePartnerPayment(providerPayment.id,session.id)]);assert.equal(settlements.filter(r=>r.applied).length,1);assert.equal(notificationCount,0);assert.equal(studioCount,0);assert.equal((await call(`orders/${id}/state`)).data.payment_status,'paid');
 const rejection=await create('government','gov-reject');await quote(rejection);financial=await offer(rejection,'gov-reject');assert.equal((await call(`orders/${rejection}/offer`,{method:'POST',who:'gov-reject',body:{action:'reject',offer_revision:financial.offer_revision,reason:'لا يناسب احتياج الجهة في الاختبار'}})).data.status,'client_rejected');
 const free=await create('government','gov-free');await quote(free,0);financial=await offer(free,'gov-free');const gift=await call(`orders/${free}/offer`,{method:'POST',who:'gov-free',body:{action:'accept',offer_revision:financial.offer_revision}});assert.equal(gift.data.status,'in_progress');assert.equal(gift.data.ready_for_payment,false);assert.equal((await call(`orders/${free}/checkout`,{method:'POST',who:'gov-free',body:{}})).status,409);
 const old=await create('business','expired-offer');await quote(old,1000,true);financial=await offer(old,'expired-offer');assert.equal(financial.expired,true);assert.equal((await call(`orders/${old}/offer`,{method:'POST',who:'expired-offer',body:{action:'accept',offer_revision:financial.offer_revision}})).status,409);
 const neg=await create('business','negotiator');await quote(neg);financial=await offer(neg,'negotiator');const revision=financial.offer_revision;await quote(neg,1100);assert.equal((await call(`orders/${neg}/offer`,{method:'POST',who:'negotiator',body:{action:'accept',offer_revision:revision}})).error.code,'OFFER_CHANGED');await quote(neg,1000);
 for(let i=1;i<=3;i++){financial=await offer(neg,'negotiator');const nk=crypto.randomUUID(),nb={action:'negotiate',offer_revision:financial.offer_revision,reason:'طلب تعديل السعر للاختبار المعزول',proposed_amount:10000};const nr=await call(`orders/${neg}/offer`,{method:'POST',who:'negotiator',key:nk,body:nb});assert.equal(nr.status,200,JSON.stringify(nr));assert.equal(nr.data.amount,100000-i*5000);assert.equal((await call(`orders/${neg}/offer`,{method:'POST',who:'negotiator',key:nk,body:nb})).data.amount,nr.data.amount)}
 financial=await offer(neg,'negotiator');assert.equal(financial.negotiation.monthly_used,3);assert.equal((await call(`orders/${neg}/offer`,{method:'POST',who:'negotiator',body:{action:'negotiate',offer_revision:financial.offer_revision,reason:'طلب جولة رابعة لا يجب أن يقبل'}})).error.code,'NEGOTIATION_LIMIT');
 financial=await offer(neg,'negotiator');assert.equal((await call(`orders/${neg}/offer`,{method:'POST',who:'negotiator',body:{action:'reject',offer_revision:financial.offer_revision,reason:'إغلاق عرض الاختبار لاستكمال فحص الحصة'}})).status,200);const monthly=await create('government','negotiator');await quote(monthly);financial=await offer(monthly,'negotiator');assert.equal(financial.negotiation.monthly_used,3);assert.equal((await call(`orders/${monthly}/offer`,{method:'POST',who:'negotiator',body:{action:'negotiate',offer_revision:financial.offer_revision,reason:'طلب تفاوض آخر بعد استنفاد الحصة الشهرية'}})).error.code,'NEGOTIATION_LIMIT');
 const fallback=await create('business','fallback-extras');await quote(fallback);check(await db.from('partner_sandbox_orders').update({admin_offered_extras:[],updated_at:new Date().toISOString()}).eq('id',fallback));financial=await offer(fallback,'fallback-extras');assert(Array.isArray(financial.offered_extras));assert.equal((await call(`orders/${fallback}/offer`,{method:'POST',who:'fallback-extras',body:{action:'accept',offer_revision:financial.offer_revision,selected_extras:[]}})).data.amount,100000);
 // Real deployed PDF renderer on isolated paid organization; no fiscal invoice.
 const api=createNukhbaClient({origin:'https://nukhba.media',partnerId:testId,keyId:'test',secret}),nativeFetch=globalThis.fetch;
 try{globalThis.fetch=async(input,options)=>{const u=new URL(input);if(!u.pathname.startsWith('/api/partners/v1/'))return nativeFetch(input,options);return GET(new Request(u,options),{params:Promise.resolve({path:u.pathname.slice('/api/partners/v1/'.length).split('/')})})};const pdf=await api(`orders/${id}/invoice`,{customerId:customer,responseType:'pdf'});assert.equal(Buffer.from(pdf.bytes).subarray(0,5).toString(),'%PDF-');fs.mkdirSync('output/partners/organization-qa',{recursive:true});fs.writeFileSync('output/partners/organization-qa/company-acceptance.pdf',pdf.bytes);assert.deepEqual((await api(`orders/${id}/invoice`,{customerId:customer,responseType:'pdf'})).bytes,pdf.bytes)}finally{globalThis.fetch=nativeFetch}
 assert.equal(check(await db.from('publish_requests').select('id').in('id',ids)).length,0);assert.equal(check(await db.from('service_invoices').select('id').in('request_id',ids)).length,0);
 const report={passed:true,http_checks:checks,client_types:true,category_scoping:true,organization_fields:true,manual_pending_no_price:true,invalid_payload_rejected:true,order_idempotency:true,offer_revision:true,offer_expiry:true,offer_preview:true,extras_and_discount:true,discount_used_once:true,offer_accept_reject:true,free_offer:true,negotiation_rounds_and_quota:true,action_idempotency:true,active_checkout_blocks_price_edit:true,pending_private_documents:true,customer_ownership:true,sandbox_checkout:true,settlement_idempotency:true,organization_pdf:true,production_orders_modified:false,production_invoice_created:false,provider_simulated:true,real_payment_created:false};fs.writeFileSync('output/partners/organization-qa/result.json',JSON.stringify(report,null,2));console.log(report)
}finally{if(paths.length)check(await db.storage.from('partner-sandbox-files').remove(paths));if(ids.length){for(const t of ['partner_sandbox_order_actions','partner_sandbox_invoices','partner_sandbox_payment_receipts','partner_sandbox_files','partner_sandbox_checkout_sessions'])check(await db.from(t).delete().in('request_id',ids));check(await db.from('partner_sandbox_orders').delete().in('id',ids))}check(await db.from('partner_sandbox_discounts').delete().eq('code',dc));check(await db.from('partner_nonces').delete().eq('partner_id',testId));}
