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
const testId = `qa-partner-${crypto.randomUUID()}`
const customer = 'customer-one'; const otherCustomer = 'customer-two'
const secret = crypto.randomBytes(32).toString('hex')
const publisher = 'a91880b6-2252-4aa7-807d-a53eb734771f'
process.env.PARTNER_API_CLIENTS_JSON = JSON.stringify([{ id: testId, keys: { test: secret }, influencer_ids: [publisher], return_url: 'https://example.invalid/orders/return' }])
process.env.PARTNER_CHECKOUT_SECRET = crypto.randomBytes(32).toString('hex')
process.env.PARTNER_CHECKOUT_BASE_URL = 'https://nukhba.media'
process.env.PARTNER_PAYMENT_MODE = 'live'
process.env.MOYASAR_SECRET_KEY = 'sk_live_mock_only'
process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY = 'pk_live_mock_only'
// Provider responses are simulated. This script never creates a payment or sends real mail.
let providerPayment = null; let notificationCount = 0; let studioCount = 0
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const result = {}; cache.set(file, result)
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(compiled, { exports: result, process, console, Buffer, URL, Request, Response, Headers, AbortSignal, TextEncoder, crypto: crypto.webcrypto,
    fetch: async url => {
      assert(String(url).startsWith('https://api.moyasar.com/v1/payments/'), 'Unexpected provider request')
      return Response.json(providerPayment)
    },
    require(name) {
      if (name === '@/lib/supabase-server') return { createServiceRoleClient: async () => db }
      if (name === '@/lib/email') return { notifyPaymentConfirmedToClient: async () => { notificationCount++ }, notifyContentApprovedToAdmin: async () => {}, notifyContentChangesRequested: async () => {} }
      if (name === '@/lib/auto-studio') return { autoRunRequestStudio: async () => { studioCount++ } }
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`))
      return realRequire(name)
    },
  }, { filename: file })
  return result
}
const packages = load('src/lib/individual-packages.ts')
const oldCalc = load('src/lib/auto-quote.ts')
assert.deepEqual(Array.from(packages.SINGLE_PACKAGES, p => packages.packagePrice(799, p)), [799,1199,2199,3599,1799])
assert.equal(oldCalc.calculateAutoQuote({ category: 'product', selectedExtras: [] }).total, 3000)
assert.equal(oldCalc.calculateAutoQuote({ category: 'competitions', subOption: { subcategory: 'local', position: 'second' }, selectedExtras: [] }).total, 549)
const presence = packages.getIndividualPackage('v2_presence')
const quoted = packages.priceIndividualPackage(799, presence, [{ id: 'video', price: 400 }, { id: 'bilingual', price: 300 }, { id: 'bilingual', price: 300 }], 20)
assert.equal(quoted.subtotal, 289900)
assert.equal(quoted.discount, 57980, 'Presence has no advertising or produced-video inclusion; duplicate extras never charged twice')
assert.equal(packages.PACKAGE_VERSION, '2026-11-04.v3')
assert.equal(packages.packagesForCategory().length, 5)
assert.deepEqual(Array.from(packages.SINGLE_PACKAGES, p => p.sponsoredCampaignBudget), [0,0,0,300,400])
for (const id of ['v2_basic','v2_reach']) {
  const pkg = packages.getIndividualPackage(id)
  assert(!pkg.includedExtras.includes('mention'))
  assert(!pkg.includedExtras.includes('video'))
  assert.equal(packages.priceIndividualPackage(799,pkg,[{id:'mention',price:200},{id:'video',price:400}]).subtotal, (packages.packagePrice(799,pkg)+600)*100)
}
assert.equal(presence.benefits.find(b=>b.id==='self_recorded_video').included,true)
assert.equal(presence.benefits.find(b=>b.id==='produced_video').included,false)
assert.equal(presence.benefits.find(b=>b.id==='news_cover').value,'14 يوم')
const elite = packages.getIndividualPackage('v2_elite')
assert.equal(elite.benefits.find(b=>b.id==='news_cover').value,'28 يوم')
assert.equal(elite.benefits.find(b=>b.id==='character_cover').value,'28 يوم')
assert.equal(elite.benefits.find(b=>b.id==='personal_page').value,'صفحة شخصية وتحديث مرتين خلال 6 شهور')
assert(!elite.features.some(f=>f.includes('مقتطف')))
const career = packages.getIndividualPackage('v2_career')
assert.equal(career.requiredCategory,'cv')
assert.equal(packages.priceIndividualPackage(799,career,[],20).discount,27980,'400 SAR advertising is protected from discounts')
const {initialPartnerDeliverables}=load('src/lib/partners/deliverables.ts')
assert.equal(initialPartnerDeliverables(career).filter(d=>d.label.startsWith('إعلان التوظيف')).length,5)
assert.deepEqual(Array.from(initialPartnerDeliverables({features:['ميزة قديمة']}),d=>d.label),['ميزة قديمة'])
assert.throws(() => packages.resolvePackageChannels(packages.getIndividualPackage('v2_reach'), ['x','x'], ['x','li']))
assert.throws(() => packages.resolvePackageChannels(presence, [], ['x','li']))
const { GET, POST } = load('src/app/api/partners/v1/[...path]/route.ts')
const auth = load('src/lib/partners/auth.ts')
const { settlePartnerPayment } = load('src/lib/partners/checkout.ts')
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
const { data: legacyBefore, error: legacyError } = await db.from('publish_requests').select('id,status,final_total,auto_quote_tier').is('package_snapshot', null).order('created_at').limit(5)
assert.ifError(legacyError)
let filePath
try {
  let r = await call('catalog'); assert.equal(r.status,200); assert.equal(r.data.packages.length,5)
  assert.equal(r.data.version,packages.PACKAGE_VERSION)
  assert.deepEqual(Array.from(r.data.packages,p=>p.advertising),[0,0,0,30000,40000])
  assert.equal(r.data.packages[4].required_category,'cv')
  assert(r.data.packages.every(p=>p.benefits.length===21))
  const originalFetch=globalThis.fetch
  try {
    globalThis.fetch=async(input,options)=>{
      const url=new URL(String(input))
      if(!url.pathname.startsWith('/api/partners/v1/'))return originalFetch(input,options)
      const req=new Request(url,options)
      return (req.method==='POST'?POST:GET)(req,{params:Promise.resolve({path:url.pathname.slice('/api/partners/v1/'.length).split('/')})})
    }
    const officialClient=createNukhbaClient({origin:'https://nukhba.media',partnerId:testId,keyId:'test',secret})
    assert.equal((await officialClient('catalog',{customerId:customer})).packages.length,5)
  } finally { globalThis.fetch=originalFetch }

  assert.equal(r.data.packages.find(p => p.id === 'v2_presence').advertising,0)
  assert(r.data.sub_options.competitions.hackathon.length)
  assert.equal((await call('catalog', { mutateSignature:true })).status,401)
  assert.equal((await call('catalog', { timestamp:'1000000000' })).status,401)
  const replay = crypto.randomUUID()
  assert.equal((await call('catalog', { nonce:replay })).status,200)
  assert.equal((await call('catalog', { nonce:replay })).status,409)
  const baseQuote = { package_id:'v2_basic', category:'graduation', influencer_id:publisher, channels:['x'] }
  assert.equal((await call('quotes', { method:'POST',body:{...baseQuote,channels:['x','li']} })).status,400)
  assert.equal((await call('quotes', { method:'POST',body:{...baseQuote,category:'unknown'} })).status,400)
  assert.equal((await call('quotes', { method:'POST',body:{...baseQuote,category:'competitions',sub_option:{subcategory:'local',position:'fake'}} })).status,400)
  assert.equal((await call('quotes', { method:'POST',body:{...baseQuote,package_id:'v2_career'} })).status,400)
  const quote = await call('quotes', { method:'POST',body:baseQuote }); assert.equal(quote.status,200)
  assert.equal(quote.data.snapshot.pricing.total,79900)
  assert.equal(quote.data.snapshot.pricing.vat,0)
  for (const [package_id,category,channels,advertising] of [
    ['v2_presence','graduation',['x','li','ig','tk'],0],
    ['v2_elite','graduation',['x','li','ig','tk'],30000],
    ['v2_career','cv',['x','li'],40000],
  ]) {
    const priced = await call('quotes',{method:'POST',body:{package_id,category,influencer_id:publisher,channels}})
    assert.equal(priced.status,200)
    assert.equal(priced.data.snapshot.pricing.advertising,advertising)
    assert.equal(priced.data.snapshot.version,packages.PACKAGE_VERSION)
  }
  const reachVideo=await call('quotes',{method:'POST',body:{package_id:'v2_reach',category:'graduation',influencer_id:publisher,channels:['x','tk'],extras:['video','mention']}})
  assert.equal(reachVideo.data.snapshot.pricing.total,179900,'TikTok does not silently include production or mention in the updated reach package')
  const oldQuote=await call('quotes',{method:'POST',body:baseQuote,who:'legacy-snapshot-customer'})
  const rawHistorical=await db.from('partner_quotes').select('snapshot').eq('id',oldQuote.data.id).single()
  assert.ifError(rawHistorical.error)
  const oldSnapshot={...rawHistorical.data.snapshot,version:'2026-11-04.v2',package:{...rawHistorical.data.snapshot.package,features:['ميزة محفوظة من النسخة القديمة']},pricing:{...rawHistorical.data.snapshot.pricing,advertising:25000}}
  delete oldSnapshot.package.benefits
  const historicalUpdate=await db.from('partner_quotes').update({snapshot:oldSnapshot}).eq('id',oldQuote.data.id)
  assert.ifError(historicalUpdate.error)
  const historical=await call('orders',{method:'POST',who:'legacy-snapshot-customer',body:{quote_id:oldQuote.data.id,title:'QA retained snapshot',content:'Synthetic historical quote fixture.',customer:{name:'QA Historical',phone:'+966500000000',email:'qa@example.invalid'}}})
  assert.equal(historical.status,200)
  const preserved=await call(`orders/${historical.data.id}`,{who:'legacy-snapshot-customer'})
  assert.equal(preserved.data.package_snapshot.version,'2026-11-04.v2')
  assert.deepEqual(preserved.data.package_snapshot.package.features,['ميزة محفوظة من النسخة القديمة'])
  assert.equal(preserved.data.package_snapshot.pricing.advertising,25000)
  const orderBody={quote_id:quote.data.id,title:'QA integration order',content:'Test fixture; do not fulfill.',customer:{name:'اختبار ربط',phone:'+966500000000',email:'qa@example.invalid'}}
  const orderKey=crypto.randomUUID()
  const concurrent=await Promise.all([call('orders',{method:'POST',body:orderBody,key:orderKey}),call('orders',{method:'POST',body:orderBody,key:orderKey})])
  assert(concurrent.every(r=>r.status===200),JSON.stringify(concurrent))
  assert.equal(concurrent[0].data.id,concurrent[1].data.id)
  assert.equal(concurrent.filter(r=>r.data.replayed).length,1)
  const id=concurrent[0].data.id
  assert.equal((await call('orders',{method:'POST',body:{...orderBody,title:'changed'},key:orderKey})).status,409)
  assert.equal((await call(`orders/${id}`,{who:otherCustomer})).status,404)
  assert.equal((await call(`orders/${id}/checkout`,{method:'POST',body:{},who:otherCustomer})).status,404)
  const list=await call('orders'); assert(list.data.orders.some(o=>o.id===id))
  const otherList=await call('orders',{who:otherCustomer}); assert.equal(otherList.data.orders.length,0)
  const details=await call(`orders/${id}`);assert.equal(details.data.source_site,testId);assert.equal(details.data.admin_notes,undefined)
  const sessions=await Promise.all([call(`orders/${id}/checkout`,{method:'POST',body:{}}),call(`orders/${id}/checkout`,{method:'POST',body:{}})])
  assert(sessions.every(r=>r.status===200),JSON.stringify(sessions))
  assert.equal(sessions[0].data.checkout_url,sessions[1].data.checkout_url)
  const token=new URLSearchParams(new URL(sessions[0].data.checkout_url).hash.slice(1)).get('token')
  const sessionId=token.split('.')[0]
  const checkout=load('src/lib/partners/checkout.ts')
  assert.equal((await checkout.checkoutSession(token)).amount,79900)
  await assert.rejects(checkout.checkoutSession(token.replace(/.$/,'z')))
  providerPayment={id:'qa_payment_'+crypto.randomUUID(),status:'paid',amount:79900,currency:'SAR',metadata:{resource_type:'partner_order',request_id:crypto.randomUUID(),partner_checkout_id:sessionId}}
  await assert.rejects(settlePartnerPayment(providerPayment.id,sessionId))
  providerPayment.metadata.request_id=id
  providerPayment.amount=1; await assert.rejects(settlePartnerPayment(providerPayment.id,sessionId)); providerPayment.amount=79900
  providerPayment.currency='USD';await assert.rejects(settlePartnerPayment(providerPayment.id,sessionId));providerPayment.currency='SAR'
  const payments=await Promise.all([settlePartnerPayment(providerPayment.id,sessionId),settlePartnerPayment(providerPayment.id,sessionId)])
  assert.equal(payments.filter(p=>p.applied).length,1)
  await new Promise(r=>setTimeout(r,10))
  assert.equal(notificationCount,1);assert.equal(studioCount,1)
  const paid=await call(`orders/${id}`);assert.equal(paid.data.payment_status,'paid');assert.equal(paid.data.status,'in_progress')
  providerPayment.id='qa_duplicate_'+crypto.randomUUID()
  const duplicatePayment=await settlePartnerPayment(providerPayment.id,sessionId)
  assert.equal(duplicatePayment.review_required,true)
  const receipt=await db.from('partner_payment_receipts').select('status').eq('payment_id',providerPayment.id).single()
  assert.equal(receipt.data.status,'review_required');assert.equal(notificationCount,1)
  process.env.MOYASAR_WEBHOOK_SECRET=crypto.randomBytes(24).toString('hex')
  const webhook=load('src/app/api/webhooks/moyasar/route.ts')
  const hookPayload={id:crypto.randomUUID(),type:'payment_paid',secret_token:process.env.MOYASAR_WEBHOOK_SECRET,data:{id:providerPayment.id,metadata:providerPayment.metadata}}
  const sendHook=payload=>webhook.POST(new Request('https://nukhba.media/api/webhooks/moyasar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}))
  assert.equal((await sendHook({...hookPayload,secret_token:'wrong'})).status,401)
  assert.equal((await sendHook(hookPayload)).status,200,'Official secret_token webhook envelope accepted')
  providerPayment.amount=1
  assert.equal((await sendHook(hookPayload)).status,503,'Transient/verification failures must trigger provider retry')
  providerPayment.amount=79900
  await db.from('webhook_logs').delete().eq('payment_id',providerPayment.id)

  const expiring=await call('quotes',{method:'POST',body:baseQuote,who:otherCustomer})
  await db.from('partner_quotes').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('id',expiring.data.id)
  const expired=await call('orders',{method:'POST',who:otherCustomer,body:{...orderBody,quote_id:expiring.data.id}})
  assert.equal(expired.error.code,'QUOTE_EXPIRED')
  const careerQuote=await call('quotes',{method:'POST',who:otherCustomer,body:{package_id:'v2_career',category:'cv',influencer_id:publisher}})
  assert.equal(careerQuote.data.snapshot.pricing.total,179900)
  const invalidCareer=await call('orders',{method:'POST',who:otherCustomer,body:{...orderBody,quote_id:careerQuote.data.id}})
  assert.equal(invalidCareer.error.code,'CAREER_DETAILS_REQUIRED')
  const careerOrder=await call('orders',{method:'POST',who:otherCustomer,body:{...orderBody,quote_id:careerQuote.data.id,career:{language:'en',goal:'Target role',experience:'Projects',education:'Degree'}}})
  assert.equal(careerOrder.status,200)
  const anotherQuote=await call('quotes',{method:'POST',who:otherCustomer,body:baseQuote})
  const blocked=await call('orders',{method:'POST',who:otherCustomer,body:{...orderBody,quote_id:anotherQuote.data.id}})
  assert.equal(blocked.error.code,'OPEN_REQUEST_EXISTS')
  const cancelled=await call(`orders/${careerOrder.data.id}/cancel`,{method:'POST',who:otherCustomer,body:{}});assert.equal(cancelled.data.status,'cancelled')
  assert.equal((await call(`orders/${id}/cancel`,{method:'POST',body:{}})).error.code,'ORDER_NOT_CANCELLABLE')

  assert.equal((await call(`orders/${id}/checkout`,{method:'POST',body:{}})).status,409)
  // Private upload and confirmation are exercised against the real Storage API.
  const bytes=Buffer.from('%PDF-1.4\n% QA private supporting document\n%%EOF\n')
  const upload=await call(`orders/${id}/files`,{method:'POST',body:{name:'qa.pdf',mime_type:'application/pdf',size:bytes.length}})
  assert.equal(upload.status,200,JSON.stringify(upload))
  const {data:file}=await db.from('partner_files').select('path').eq('id',upload.data.id).single();filePath=file.path
  const uploaded=await fetch(upload.data.upload_url,{method:'PUT',headers:{'content-type':'application/pdf'},body:bytes})
  assert(uploaded.ok,await uploaded.text())
  const completedFile = await call(`orders/${id}/files/${upload.data.id}/complete`,{method:'POST',body:{}}); assert.equal(completedFile.status,200,JSON.stringify(completedFile))
  assert.equal((await call(`orders/${id}/files/${upload.data.id}/complete`,{method:'POST',body:{},who:otherCustomer})).status,404)
  assert.equal((await call(`orders/${id}/files`,{method:'POST',body:{name:'malware.svg',mime_type:'image/svg+xml',size:12}})).status,400)
  const withFile=await call(`orders/${id}`);assert.equal(withFile.data.files.length,1)
  const {error:reviewSeedError}=await db.from('publish_requests').update({status:'content_review',proposed_content:'نسخة للمراجعة',proposed_images:[],content_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id)
  assert.ifError(reviewSeedError)
  // Admin normally sends the version through post_reviews[0]; the API must expose that exact version.
  await db.from('publish_requests').update({post_reviews:{0:{proposed_content:'نسخة أحدث من الاستوديو',proposed_images:[],content_sent_at:new Date().toISOString(),history:[]}}}).eq('id',id)
  const review=await call(`orders/${id}`)
  assert.equal(review.data.proposed_content,'نسخة أحدث من الاستوديو')
  assert.equal((await call(`orders/${id}/review`,{method:'POST',body:{action:'approve',content_revision:'0'.repeat(64)}})).status,409)
  assert.equal((await call(`orders/${id}/review`,{method:'POST',body:{action:'approve',content_revision:review.data.content_revision}})).status,200)
  assert.equal((await call(`orders/${id}/review`,{method:'POST',body:{action:'approve',content_revision:review.data.content_revision}})).status,409)
  const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  assert((await anon.from('partner_quotes').select('id')).error,'Anonymous direct access must be denied')
  const {data:legacyAfter,error:afterError}=await db.from('publish_requests').select('id,status,final_total,auto_quote_tier').in('id',legacyBefore.map(r=>r.id)).order('created_at')
  assert.ifError(afterError);assert.deepEqual(legacyAfter,legacyBefore)
  const report={passed:true,http_checks:checks,pricing:true,ownership:true,replay:true,concurrent_orders:true,concurrent_payment:true,private_storage:true,content_revision:true,legacy_unchanged:true,provider:'simulated; no payment created',client_sdk:true,webhook_auth_and_retry:true}
  fs.mkdirSync('output/partners/qa',{recursive:true});fs.writeFileSync('output/partners/qa/api-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
} finally {
  if(filePath) await db.storage.from('partner-files').remove([filePath])
  const {data:orders}=await db.from('publish_requests').select('id').eq('partner_id',testId)
  const ids=(orders??[]).map(r=>r.id)
  await db.from('partner_quotes').delete().eq('partner_id',testId)
  if(ids.length){await db.from('partner_payment_receipts').delete().in('request_id',ids);await db.from('partner_files').delete().in('request_id',ids);await db.from('partner_checkout_sessions').delete().in('request_id',ids);await db.from('publish_requests').delete().eq('partner_id',testId)}
  await db.from('partner_nonces').delete().eq('partner_id',testId)
}
