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
const ids=[],paths=[],passed=[];
try{
 for(const who of [customer,otherCustomer]){const r=await call('orders',{method:'POST',who,body:{client_type:'business',request_type:'single',influencer_id:publisher,category:'product',org_name:'جهة اختبار معزولة',channels:['x'],title:'اختبار الطلب القائم — لا ينشر',content:'بيانات اختبار معزولة.',customer:{name:'QA',email:'qa@example.invalid',phone:'0500000000'}}});assert.equal(r.status,200,JSON.stringify(r));ids.push(r.data.id);}
 for(const [index,who]of [customer,otherCustomer].entries()){const r=await call('orders?page=0&open=1',{who});assert.equal(r.status,200);assert.deepEqual(r.data.orders.map(o=>o.id),[ids[index]]);}passed.push('Signed open-order query returns only each customer’s own current partner orders');
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=','base64');
 for(const [name,mime,bytes]of [['[news-design] خبر-1.png','image/png',image],['[news-design] خبر-2.png','image/png',image],['[supporting] وثيقة.pdf','application/pdf',Buffer.from('%PDF-1.4\n%%EOF')]]){const r=await call(`orders/${ids[0]}/files`,{method:'POST',body:{name,mime_type:mime,size:bytes.length}});assert.equal(r.status,200,JSON.stringify(r));const file=await db.from('partner_sandbox_files').select('path').eq('id',r.data.id).single();assert.ifError(file.error);paths.push(file.data.path);assert.ifError((await db.storage.from('partner-sandbox-files').upload(file.data.path,bytes,{contentType:mime})).error);assert.equal((await call(`orders/${ids[0]}/files/${r.data.id}/complete`,{method:'POST',body:{}})).status,200);}
 const own=await call(`orders/${ids[0]}`);assert.equal(own.data.files.length,3);assert.equal(own.data.files.filter(f=>f.name.startsWith('[news-design] ')).length,2);assert.equal(own.data.files.filter(f=>f.name.startsWith('[supporting] ')).length,1);assert.equal((await call(`orders/${ids[0]}`,{who:otherCustomer})).status,404);passed.push('Two classified images and one supporting PDF are stored in real isolated central storage, completed, returned to their owner and denied to the other customer');
 assert.ifError((await db.from('partner_sandbox_orders').update({status:'completed'}).eq('id',ids[0])).error);assert.equal((await call('orders?open=1')).data.orders.length,0);assert.equal((await call('orders?page=0')).data.orders.length,1);assert.equal((await call('orders?open=1',{who:otherCustomer})).data.orders[0].id,ids[1]);passed.push('Completed requests disappear only from the open-order gate; normal history and the second customer remain intact');
 const report={success:true,checks:passed,http_checks:checks,production_orders_modified:false,real_payments:0};fs.writeFileSync('output/partners/checkout-brand-20261105/open-order-media-sandbox-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
 if(paths.length)assert.ifError((await db.storage.from('partner-sandbox-files').remove(paths)).error);
 if(ids.length){assert.ifError((await db.from('partner_sandbox_files').delete().in('request_id',ids)).error);assert.ifError((await db.from('partner_sandbox_orders').delete().in('id',ids)).error);}assert.ifError((await db.from('partner_nonces').delete().eq('partner_id',testId)).error);
}
