import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
dotenv.config({path:'.env.local',quiet:true})
const {Browser}=await import(pathToFileURL(path.join(process.env.USERPROFILE,'.codex/skills/taste-skill/scripts/lib/cdp.mjs')))
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const base=process.env.PACKAGE_QA_ORIGIN??'http://localhost:3016',out=path.resolve('output/partners/v3-qa')
mkdirSync(out,{recursive:true})
const server=base.startsWith('http://localhost:')?spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3016'],{env:{...process.env,NODE_ENV:'production'},windowsHide:true,stdio:['ignore','pipe','pipe']}):null
let logs='';server?.stdout.on('data',d=>logs+=d);server?.stderr.on('data',d=>logs+=d)
let browser,userId,ssr,email,qaPage
try{
 for(let i=0;i<45;i++){try{if((await fetch(base+'/pricing')).ok)break}catch{}if(i===44)throw Error('Server unavailable '+logs.slice(-1000));await new Promise(r=>setTimeout(r,1000))}
 browser=await Browser.launch();const page=await browser.newPage();qaPage=page
 const waitFor=async(fn)=>{for(let i=0;i<60;i++){if(await page.eval(fn))return;await new Promise(r=>setTimeout(r,500))}throw Error('Timed out waiting for the request form')}
 await page.goto(base+'/pricing',{timeoutMs:45000,settleMs:1700})
 const texts=await page.eval(()=>[...document.querySelectorAll('h2')].filter(h=>['الأساسية','الانتشار','الظهور المتكامل','النخبة','الحضور المهني'].includes(h.textContent.trim())).map(h=>({name:h.textContent,text:h.parentElement.innerText})))
 assert.equal(texts.length,5)
 assert(texts[2].text.includes('14 يوم'));assert(!texts[2].text.includes('250'))
 assert(texts[3].text.includes('300 ريال'));assert(texts[3].text.includes('28 يوم'));assert(texts[3].text.includes('تحديث مرتين خلال 6 شهور'));assert(!texts[3].text.includes('مقتطف'))
 assert(texts[4].text.includes('400 ريال'));assert(texts[4].text.includes('5 إعلانات'));assert(texts[4].text.includes('ATS'))
 assert(!texts[0].text.includes('بموافقة العميل'));assert(!texts[1].text.includes('بموافقة العميل'))
 for(const width of [1440,768,390]){await page.setViewport({width,height:1000,mobile:width===390});assert(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`pricing-${width}.png`),format:'png',fullPage:true})}
 email=`qa-v3-${crypto.randomUUID()}@example.invalid`;const password=crypto.randomBytes(24).toString('base64url')+'aA1!'
 const created=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'اختبار الباقات'}});assert.ifError(created.error);userId=created.data.user.id
 const jar=[];ssr=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:e=>jar.push(...e)}})
 const signed=await ssr.auth.signInWithPassword({email,password});assert.ifError(signed.error)
 await page.send('Network.enable');for(const c of jar)await page.send('Network.setCookie',{name:c.name,value:c.value,url:base,path:'/'})
 await page.goto(base+'/request',{timeoutMs:45000,settleMs:1500})
 const injection=await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('tn_request_draft_v1',JSON.stringify({savedAt:Date.now(),selectedInfluencer:'a91880b6-2252-4aa7-807d-a53eb734771f',requestType:'single',clientType:'individual',category:'graduation',details:{title:'اختبار باقات',content:'اختبار فني لا ينفذ.',link:'',hashtags:'',preferredDate:'',images:[],supportingDocuments:[]},selectedPackage:'v2_basic',basicChannel:'x'}))`})
 await page.goto(base+'/request',{timeoutMs:45000,settleMs:1800})
 await waitFor(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('اختر الباقة')))
 await page.eval(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('اختر الباقة')).click())
 await waitFor(()=>[...document.querySelectorAll('button span')].some(s=>s.textContent==='الحضور المهني'))
 const packages=await page.eval(()=>['الأساسية','الانتشار','الظهور المتكامل','النخبة','الحضور المهني'].map(name=>[...document.querySelectorAll('button span')].some(s=>s.textContent===name)))
 assert(packages.every(Boolean),'All five packages must be visible for graduation')
 await page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier})
 for(const width of [1440,768,390]){
  await page.setViewport({width,height:1000,mobile:width===390})
  const layout=await page.eval(()=>{const grid=document.querySelector('[data-package-grid]'),r=grid.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,viewport:innerWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1}})
  assert(!layout.overflow,JSON.stringify(layout))
  if(width===1440){assert.equal(layout.columns,5);assert(layout.width>width*.9,JSON.stringify(layout))}
  await page.screenshot({path:path.join(out,`request-packages-${width}.png`),format:'png',fullPage:true})
 }

 await page.eval(()=>[...document.querySelectorAll('button')].find(b=>[...b.querySelectorAll('span')].some(s=>s.textContent==='الحضور المهني')).click())
 await new Promise(r=>setTimeout(r,300))
 await waitFor(()=>JSON.parse(localStorage.getItem('tn_request_draft_v1')??'{}').category==='cv')
 assert.equal(await page.eval(()=>JSON.parse(localStorage.getItem('tn_request_draft_v1')).category),'cv')
 assert(await page.eval(()=>document.body.innerText.includes('البيانات المهنية المطلوبة')))
 await page.setViewport({width:1440,height:1000});await page.screenshot({path:path.join(out,'career-selected.png'),format:'png',fullPage:true})
 await page.goto(base+'/request?package=v2_career',{timeoutMs:45000,settleMs:1700})
 await waitFor(()=>JSON.parse(localStorage.getItem('tn_request_draft_v1')??'{}').category==='cv')
 assert.equal(await page.eval(()=>JSON.parse(localStorage.getItem('tn_request_draft_v1')).category),'cv')
 const response=await page.eval(async email=>{const r=await fetch('/api/submit-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_type:'single',client_type:'individual',influencer_id:'a91880b6-2252-4aa7-807d-a53eb734771f',category:'cv',selected_package:'v2_career',catalog_version:(await(await fetch('/api/individual-catalog')).json()).version,channels:['x','li'],title:'QA باقة مهنية',content:'طلب اختبار فني فقط لا ينفذ.',client_name:'QA Package',client_phone:'+966500000000',client_email:email,selected_extras:[],career:{language:'ar',goal:'هدف تجريبي',experience:'خبرة تجريبية',education:'تعليم تجريبي'}})});return {status:r.status,data:await r.json()}},email)
 assert.equal(response.status,200,JSON.stringify(response))
 const saved=await db.from('publish_requests').select('final_total,package_snapshot').eq('user_id',userId).single();assert.ifError(saved.error)
 assert.equal(saved.data.final_total,1799);assert(saved.data.package_snapshot.version.startsWith('catalog-'));assert.equal(saved.data.package_snapshot.pricing.advertising,40000)
 assert(saved.data.package_snapshot.package.features.some(f=>f.includes('5 إعلانات')))
 const result={passed:true,origin:base,viewports:[1440,768,390],desktop_full_width:true,desktop_columns:5,all_five_for_graduation:true,career_switches_category:true,career_deep_link:true,native_order_snapshot:true,career_total:1799,career_advertising:400,provider_payment_submitted:false}
 writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(e){if(qaPage){console.error(await qaPage.eval(()=>({path:location.pathname,text:document.body.innerText})));await qaPage.screenshot({path:path.join(out,'failure.png'),format:'png',fullPage:true})}console.error(logs.slice(-1500));throw e}
finally{
 if(browser)await browser.close()
 if(userId){await db.from('publish_requests').delete().eq('user_id',userId);await db.from('request_recovery_drafts').delete().eq('user_id',userId);if(ssr)await ssr.auth.signOut();await db.auth.admin.deleteUser(userId)}
 if(server&&server.exitCode===null)spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
}
