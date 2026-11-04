import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

dotenv.config({path:'.env.local',quiet:true})
assert(process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.startsWith('pk_test_'), 'Browser QA requires sandbox publishable key')
const { Browser }=await import(pathToFileURL(path.join(process.env.USERPROFILE,'.codex/skills/taste-skill/scripts/lib/cdp.mjs')))
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const partner='qa-browser-'+crypto.randomUUID(), secret=crypto.randomBytes(32).toString('hex')
const pub='a91880b6-2252-4aa7-807d-a53eb734771f', base='http://localhost:3012'
const env={...process.env,NODE_ENV:'development',NEXT_PUBLIC_SITE_URL:base,PARTNER_CHECKOUT_BASE_URL:base,PARTNER_CHECKOUT_SECRET:crypto.randomBytes(32).toString('hex'),PARTNER_API_CLIENTS_JSON:JSON.stringify([{id:partner,keys:{test:secret},influencer_ids:[pub],return_url:'https://first1saudi.net/services/orders/return',notifications:false,auto_studio:false}])}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3012'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']})
let logs='';server.stdout.on('data',d=>{logs+=d});server.stderr.on('data',d=>{logs+=d})
let browser, userId, qaPage, nativeId
const out=path.resolve('output/partners/qa');mkdirSync(out,{recursive:true})
async function api(target,body){
 const method=body?'POST':'GET',raw=body?JSON.stringify(body):'',timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID(),key=body?crypto.randomUUID():''
 const url='/api/partners/v1/'+target
 const canonical=[method,url,timestamp,nonce,'browser-customer',key,crypto.createHash('sha256').update(raw).digest('hex')].join('\n')
 const r=await fetch(base+url,{method,headers:{'content-type':'application/json','x-partner-id':partner,'x-key-id':'test','x-timestamp':timestamp,'x-nonce':nonce,'x-customer-id':'browser-customer','idempotency-key':key,'x-signature':crypto.createHmac('sha256',secret).update(canonical).digest('hex')},...(body?{body:raw}:{})})
 const result=await r.json();assert(r.ok,JSON.stringify(result));return result.data
}
try{
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(logs.slice(-4000));try{if((await fetch(base+'/api/partners/v1/catalog')).status===401)break}catch{};await new Promise(r=>setTimeout(r,1000));if(i===99)throw Error('Next did not start: '+logs.slice(-4000))}
 const catalog=await api('catalog');assert.equal(catalog.packages.length,5)
 const quote=await api('quotes',{package_id:'v2_basic',category:'graduation',influencer_id:pub,channels:['li']})
 const order=await api('orders',{quote_id:quote.id,title:'اختبار واجهة الدفع',content:'طلب اختبار خاص لا ينفذ.',customer:{name:'اختبار الواجهة',phone:'+966500000000',email:'qa@example.invalid'}})
 const checkout=await api(`orders/${order.id}/checkout`,{})
 browser=await Browser.launch()
 const page=await browser.newPage(); qaPage=page
 // This workstation's browser/Node TLS path resets the CDN connection. Replay exact official
 // assets fetched by curl with normal certificate verification; application URLs are unchanged.
 const assets={}
 for(const ext of ['js']){
  const url=`https://cdn.moyasar.com/mpf/1.14.0/moyasar.${ext}`
  const fixture=path.resolve(`tmp/partner-design/moyasar.${ext}`)
  assert(existsSync(fixture),'Fetch official CDN JS with verified curl before browser QA')
  assets[url]={body:readFileSync(fixture).toString('base64'),type:ext==='js'?'application/javascript':'text/css'}
 }
 page.browser.on(page.sessionId,'Fetch.requestPaused',async event=>{
  const asset=assets[event.request.url]
  await page.send(asset?'Fetch.fulfillRequest':'Fetch.continueRequest',asset?{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:asset.type}],body:asset.body}:{requestId:event.requestId})
 })
 await page.send('Fetch.enable',{patterns:[{urlPattern:'https://cdn.moyasar.com/mpf/1.14.0/moyasar.js'}]})

 await page.goto(checkout.checkout_url,{timeoutMs:45000,settleMs:4500})
 assert.equal(await page.eval(()=>location.pathname),'/checkout/partner')
 for(let i=0;i<35;i++){if(await page.eval(()=>document.body.innerText.includes('الأساسية')))break;await new Promise(r=>setTimeout(r,1000))}
 const text=await page.eval(()=>document.body.innerText)
 assert(text.includes('الدفع لشركة تواصل النخبة'),text)
 assert(text.includes('الأساسية'),text)
 assert(!text.includes('خصم 20%'), 'Checkout must not display marketing popups')
 for(let i=0;i<30;i++){if(await page.eval(()=>document.querySelectorAll('input').length>=4 && !!window.Moyasar))break;await new Promise(r=>setTimeout(r,1000))}
 assert(await page.eval(()=>document.querySelectorAll('input').length>=4 && !!window.Moyasar),'Moyasar form must render')
 for(const width of [1440,768,390]){
  await page.setViewport({width,height:1000,mobile:width===390})
  assert(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth+1),'Checkout overflow')
  await page.screenshot({path:path.join(out,`checkout-${width}.png`),format:'png',fullPage:true})
 }
 await page.goto(base+'/pricing',{timeoutMs:45000,settleMs:2000})
 const pricing=await page.eval(()=>document.body.innerText)
 for(const label of ['الأساسية','الانتشار','الظهور المتكامل','النخبة','الحضور المهني'])assert(pricing.includes(label))
 await page.screenshot({path:path.join(out,'pricing.png'),format:'png',fullPage:true})
 // An isolated confirmed Auth account tests the actual SSR session and current request wizard.
 const email=`qa-native-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(24).toString('base64url')+'aA1!'
 const created=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'اختبار الباقات'}})
 assert.ifError(created.error);userId=created.data.user.id
 const jar=[]
 const ssr=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:entries=>jar.push(...entries)}})
 const signed=await ssr.auth.signInWithPassword({email,password});assert.ifError(signed.error)
 const customerDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${signed.data.session.access_token}`}}})
 const hidden=await customerDb.from('publish_requests').select('id').eq('id',order.id);assert.ifError(hidden.error);assert.equal(hidden.data.length,0,'Authenticated customer must not see partner orders through Data API')
 nativeId=crypto.randomUUID()
 const nativeInsert=await db.from('publish_requests').insert({id:nativeId,user_id:userId,source_site:'nukhba',package_snapshot:{version:quote.snapshot.version,package:{id:'v2_basic',name:'الأساسية',features:[]},pricing:quote.snapshot.pricing},category:'cv',scope:'single',images:'one',title:'اختبار صلاحيات الطلب',content:'طلب اختبار',client_name:'اختبار',client_phone:'+966500000000',client_email:email,status:'approved',final_total:799})
 assert.ifError(nativeInsert.error)
 const owned=await customerDb.from('publish_requests').select('id').eq('id',nativeId);assert.equal(owned.data?.length,1,'Owner must still read own new native order')
 const tamper=await customerDb.from('publish_requests').update({final_total:1}).eq('id',nativeId).select('id');assert.equal(tamper.data?.length??0,0,'Customer must not overwrite server price')
 const immutable=await db.from('publish_requests').select('final_total').eq('id',nativeId).single();assert.equal(immutable.data.final_total,799)
 await db.from('publish_requests').update({status:'cancelled'}).eq('id',nativeId)

 await page.send('Network.enable')
 for(const entry of jar)await page.send('Network.setCookie',{name:entry.name,value:entry.value,url:base,path:'/'})
 await page.goto(base+'/request',{timeoutMs:45000,settleMs:2000})
 await page.eval(pub=>localStorage.setItem('tn_request_draft_v1',JSON.stringify({savedAt:Date.now(),selectedInfluencer:pub,requestType:'single',clientType:'individual',category:'cv',details:{title:'ملفي المهني',content:'تجربة الباقات',link:'',hashtags:'',preferredDate:'',images:[],supportingDocuments:[]},selectedPackage:'v2_career',career:{language:'ar',goal:'الهدف المهني',experience:'مشاريع وتجارب',education:'المؤهلات'}})),pub)
 await page.goto(base+'/request',{timeoutMs:45000,settleMs:2000})
 assert.equal(await page.eval(()=>location.pathname),'/request')
 const wizard=await page.eval(()=>document.body.innerText)
 assert(wizard.includes('اختر الباقة'),wizard)
 await page.eval(()=>{const buttons=[...document.querySelectorAll('button')];buttons.find(b=>b.textContent.includes('اختر الباقة'))?.click()})
 await new Promise(r=>setTimeout(r,300))
 const openWizard=await page.eval(()=>document.body.innerText)
 assert(openWizard.includes('بيانات الحضور المهني'),openWizard)
 await page.screenshot({path:path.join(out,'native-career.png'),format:'png',fullPage:true})
 assert.equal(page.consoleErrors.filter(e=>!e.includes('Failed to fetch')).length,0,JSON.stringify(page.consoleErrors))
 writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,real_http_api:true,ssr_customer_session:true,checkout_form:true,viewports:[1440,768,390],native_career_fields:true,payment_submitted:false,cdn_assets:'official CDN replay via verified curl, browser TLS blocked in workstation'},null,2))
 console.log('PASS: actual Next HTTP API, scoped checkout, sandbox form rendering, three widths, pricing, authenticated native career form. No payment submitted.')
}catch(error){if(qaPage){await qaPage.screenshot({path:path.join(out,'failure.png'),format:'png',fullPage:true});console.error(await qaPage.eval(()=>({text:document.body.innerText,forms:[...document.querySelectorAll('input')].map(i=>({name:i.name,type:i.type})),scripts:[...document.scripts].map(s=>s.src).filter(s=>s.includes('moyasar'))})));console.error(qaPage.consoleErrors)}console.error(logs.slice(-2500));throw error}
finally{
 if(browser)await browser.close()
 if(nativeId)await db.from('publish_requests').delete().eq('id',nativeId)
 if(userId)await db.auth.admin.deleteUser(userId)
 const {data:orders}=await db.from('publish_requests').select('id').eq('partner_id',partner)
 await db.from('partner_quotes').delete().eq('partner_id',partner)
 if(orders?.length){const ids=orders.map(o=>o.id);await db.from('partner_checkout_sessions').delete().in('request_id',ids);await db.from('publish_requests').delete().eq('partner_id',partner)}
 await db.from('partner_nonces').delete().eq('partner_id',partner)
 if(server.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else server.kill('SIGTERM')}
}
