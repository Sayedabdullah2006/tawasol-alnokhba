import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import dotenv from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {createNukhbaClient} from '../docs/partners/client.mjs'
dotenv.config({path:'.env.local',quiet:true})
if(process.env.ALLOW_CATALOG_PUBLISH_TEST!=='1')throw Error('This test publishes temporary catalog releases. Use an isolated database and explicitly set ALLOW_CATALOG_PUBLISH_TEST=1.')
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const {Browser}=await import(pathToFileURL(path.join(process.env.USERPROFILE,'.codex/skills/taste-skill/scripts/lib/cdp.mjs')))
const base='http://localhost:3018',out='output/partners/dynamic-catalog-qa';fs.mkdirSync(out,{recursive:true})
const partner='qa-dynamic-'+crypto.randomUUID(),secret=crypto.randomBytes(32).toString('hex'),keyId='test'
const env={...process.env,NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:base,CATALOG_ADMIN_ORIGIN:base,PARTNER_API_CLIENTS_JSON:JSON.stringify([{id:partner,keys:{test:secret},influencer_ids:['a91880b6-2252-4aa7-807d-a53eb734771f'],return_url:'https://first1saudi.net/services/orders/return',notifications:false,auto_studio:false}])}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3018'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d)
let browser,before,expected,admin,client;const actors=[],releases=[],quoteIds=[];const api=createNukhbaClient({origin:base,partnerId:partner,keyId,secret});let checks=0
async function account(role){const email=`qa-catalog-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(24).toString('base64url')+'aA1!';const made=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(made.error);const user=made.data.user;actors.push({user,email});if(role==='admin'){const update=await db.from('profiles').update({role:'admin'}).eq('id',user.id);assert.ifError(update.error)}const jar=[];const ssr=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:c=>jar.push(...c)}});actors.at(-1).ssr=ssr;assert.ifError((await ssr.auth.signInWithPassword({email,password})).error);return {user,email,jar,cookie:jar.map(c=>`${c.name}=${c.value}`).join('; ')}}
async function request(body,who=admin,origin=base){const r=await fetch(base+'/api/admin/individual-catalog',{method:body?'POST':'GET',headers:{...(who?{cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{} )},...(body?{body:JSON.stringify(body)}:{})});checks++;return {status:r.status,data:await r.json()}}
async function published(){const r=await fetch(base+'/api/individual-catalog',{cache:'no-store'});assert.equal(r.status,200);return r.json()}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/api/individual-catalog')).ok)break}catch{}if(i===59)throw Error('Server unavailable '+logs.slice(-1000));await new Promise(r=>setTimeout(r,500))}
 const original=await db.from('individual_catalog_state').select('*').eq('id',true).single();assert.ifError(original.error);before=original.data;expected=before.revision
 admin=await account('admin');client=await account('client')
 assert.equal((await request(null,null)).status,401);assert.equal((await request(null,client)).status,403)
 assert.equal((await request({action:'publish',expected_revision:expected},admin,'https://evil.invalid')).status,403)
 const read=await request();assert.equal(read.status,200)
 const initial=await published(),oldQuote=await api('quotes',{customerId:'old-quote',body:{package_id:'v2_basic',category:'graduation',channels:['x'],influencer_id:'a91880b6-2252-4aa7-807d-a53eb734771f',catalog_version:initial.version}});quoteIds.push(oldQuote.id)
 const doc=structuredClone(read.data.draft)
 doc.packages[0].name='الأساسية اختبار الإدارة';doc.packages[0].surcharge=22.22;doc.packages[0].channelCount=2;delete doc.packages[0].channels;doc.packages[0].benefits[0].value='ميزة اختبار من قاعدة البيانات';doc.packages[1].enabled=false
 doc.newsRates.find(r=>r.key==='graduation').price=910.11;doc.extras.find(e=>e.id==='video').price=411.11
 const invalid=structuredClone(doc);invalid.packages[0].sponsoredCampaignBudget=999999
 assert.equal((await request({action:'save',expected_revision:expected,document:invalid})).status,400)
 const saved=await request({action:'save',expected_revision:expected,document:doc});assert.equal(saved.status,200,JSON.stringify(saved));expected=saved.data.revision
 assert.equal((await published()).version,initial.version,'Draft must not change the live catalog')
 assert.equal((await request({action:'publish',expected_revision:expected-1})).status,409)
 const pushed=await request({action:'publish',expected_revision:expected});assert.equal(pushed.status,200,JSON.stringify(pushed));expected=pushed.data.revision
 const state=await db.from('individual_catalog_state').select('published_release_id').eq('id',true).single();releases.push(state.data.published_release_id)
 const current=await published();assert.notEqual(current.version,initial.version);assert.equal(current.packages[0].name,doc.packages[0].name)
 const catalog=await api('catalog',{customerId:'new'});assert.equal(catalog.version,current.version);assert.equal(catalog.packages.length,4);assert.equal(catalog.categories.find(r=>r.id==='graduation').base_price,91011)
 await assert.rejects(api('quotes',{customerId:'new',body:{package_id:'v2_basic',category:'graduation',channels:['x','li'],influencer_id:'a91880b6-2252-4aa7-807d-a53eb734771f',catalog_version:initial.version}}),e=>e.status===409&&e.message==='CATALOG_CHANGED')
 const quote=await api('quotes',{customerId:'new',body:{package_id:'v2_basic',category:'graduation',channels:['x','li'],extras:['video'],influencer_id:'a91880b6-2252-4aa7-807d-a53eb734771f',catalog_version:current.version}});quoteIds.push(quote.id);assert.equal(quote.snapshot.pricing.total,134344)
 await assert.rejects(api('quotes',{customerId:'disabled',body:{package_id:'v2_reach',category:'graduation',channels:['x','li'],influencer_id:'a91880b6-2252-4aa7-807d-a53eb734771f'}}),e=>e.message==='INVALID_PACKAGE')
 const oldOrder=await api('orders',{customerId:'old-quote',body:{quote_id:oldQuote.id,title:'QA historical quote',content:'Synthetic test only.',customer:{name:'QA Customer',phone:'+966500000000',email:'qa@example.invalid'}}});const old=await api(`orders/${oldOrder.id}`,{customerId:'old-quote'});assert.equal(old.package_snapshot.version,initial.version);assert.equal(old.amount,79900)
 const body={request_type:'single',client_type:'individual',category:'graduation',selected_package:'v2_basic',channels:['x','li'],selected_extras:['video'],influencer_id:'a91880b6-2252-4aa7-807d-a53eb734771f',title:'QA dynamic native order',content:'Test fixture do not fulfill.',client_name:'QA Client',client_email:client.email,client_phone:'+966500000000',catalog_version:initial.version}
 const native=async(body)=>{const r=await fetch(base+'/api/submit-request',{method:'POST',headers:{'Content-Type':'application/json',cookie:client.cookie},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 assert.equal((await native(body)).status,409);body.catalog_version=current.version;const submitted=await native(body);assert.equal(submitted.status,200,JSON.stringify(submitted));const stored=await db.from('publish_requests').select('final_total,package_snapshot').eq('id',submitted.data.id).single();assert.ifError(stored.error);assert.equal(stored.data.final_total,1343.44);assert.equal(stored.data.package_snapshot.version,current.version)
 const html=await(await fetch(base+'/pricing')).text();assert(html.includes(doc.packages[0].name))
 browser=await Browser.launch();const page=await browser.newPage();await page.send('Network.enable');for(const c of admin.jar)await page.send('Network.setCookie',{name:c.name,value:c.value,url:base,path:'/'});await page.goto(base+'/admin/packages',{timeoutMs:45000,settleMs:2500});for(let i=0;i<50;i++){if(await page.eval(()=>document.body.innerText.includes('حفظ المسودة')))break;await new Promise(r=>setTimeout(r,500))}assert(await page.eval(()=>document.body.innerText.includes('الباقات والأسعار')))
 for(const width of [1440,768,390]){await page.setViewport({width,height:1000,mobile:width===390});assert(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`admin-${width}.png`),format:'png',fullPage:true})}
 const restored=await request({action:'restore',expected_revision:expected,release_id:before.published_release_id});assert.equal(restored.status,200);expected=restored.data.revision;assert.equal((await published()).version,current.version,'Restore only loads a draft')
 const final=await request({action:'publish',expected_revision:expected});assert.equal(final.status,200);expected=final.data.revision;const head=await db.from('individual_catalog_state').select('published_release_id').eq('id',true).single();releases.push(head.data.published_release_id);assert.equal((await published()).packages[0].name,initial.packages[0].name)
 const immutable=await db.from('individual_catalog_releases').update({version:initial.version}).eq('id',before.published_release_id);assert(immutable.error,'Published releases must not be mutable by service_role')
 const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);assert((await anon.from('individual_catalog_releases').select('id')).error)
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks,admin_auth:true,csrf:true,draft_isolation:true,atomic_publish:true,stale_revision_rejected:true,stale_catalog_rejected:true,partner_prices_dynamic:true,native_price_matches:true,disabled_package_rejected:true,old_quote_preserved:true,restore_is_draft:true,private_tables:true,viewports:[1440,768,390],no_payment_submitted:true},null,2));console.log('PASS: dynamic catalog administration, price parity, history, security and browser checks')
}catch(e){console.error(logs.slice(-1200));throw e}
finally{
 try{
 if(browser)await browser.close()
 if(before){const now=await db.from('individual_catalog_state').select('*').eq('id',true).single();if(now.data.revision!==expected)throw Error('Concurrent catalog change detected; test cleanup requires review');const reset=await db.from('individual_catalog_state').update({draft:before.draft,published_release_id:before.published_release_id,revision:expected+1,updated_by:before.updated_by}).eq('id',true).eq('revision',expected).select('revision');assert.ifError(reset.error);assert.equal(reset.data.length,1);fs.writeFileSync('.preview/catalog/qa-release-cleanup.json',JSON.stringify({releases,actor:admin?.user.id,restored:true}))}
 const orders=await db.from('publish_requests').select('id').eq('partner_id',partner);const ids=(orders.data??[]).map(o=>o.id);await db.from('partner_quotes').delete().eq('partner_id',partner);if(ids.length){await db.from('partner_checkout_sessions').delete().in('request_id',ids);await db.from('publish_requests').delete().eq('partner_id',partner)}await db.from('partner_nonces').delete().eq('partner_id',partner)
 for(const a of actors){await db.from('publish_requests').delete().eq('user_id',a.user.id);const drafts=await db.from('request_recovery_drafts').select('id').eq('user_id',a.user.id);if(drafts.data?.length){await db.from('discount_codes').delete().in('recovery_draft_id',drafts.data.map(d=>d.id));await db.from('request_recovery_drafts').delete().eq('user_id',a.user.id)}await db.from('wf_notifications').delete().eq('recipient_id',a.user.id);if(a.ssr)await a.ssr.auth.signOut();assert.ifError((await db.auth.admin.deleteUser(a.user.id)).error)}
 }finally{if(server.exitCode===null)spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}
}
