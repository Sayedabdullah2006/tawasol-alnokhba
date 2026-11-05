// Operator workflow: prepare/test, then explicitly publish after the supporting app is deployed.
// Never creates orders, checkout sessions, invoices, or payments. Verification quotes are removed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import ts from 'typescript'
import dotenv from 'dotenv'
import {createClient} from '@supabase/supabase-js'
import {createNukhbaClient} from '../docs/partners/client.mjs'
dotenv.config({path:'.env.local',quiet:true})
dotenv.config({path:'.env.first1saudi-partner',quiet:true})
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const out='output/partners/category-package-prices';fs.mkdirSync(out,{recursive:true})
const require=createRequire(import.meta.url),cache=new Map()
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports,process,console,Buffer,URL,Request,Response,Headers,AbortSignal,TextEncoder,crypto:crypto.webcrypto,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):name.startsWith('@/')?load(path.resolve('src',name.slice(2)+'.ts')):require(name)},{filename:file});return exports}
const {validateCatalog,newsPrice,packageStartingPrice}=load('src/lib/catalog/model.ts')
const {packagePrice,priceIndividualPackage}=load('src/lib/individual-packages.ts')
const plain=v=>JSON.parse(JSON.stringify(v)),write=(name,v)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(v,null,2)),read=name=>JSON.parse(fs.readFileSync(`${out}/${name}.json`,'utf8'))
const targets={appointment:[699,999],certs:[599,899],cv:[499,799],product:[3000,3400],graduation:[499,799]}
const packageIds=['v2_basic','v2_reach']
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')
async function state(){const r=await db.from('individual_catalog_state').select('*').eq('id',true).single();assert.ifError(r.error);return r.data}
async function snapshots(){let rows=[];for(let offset=0;;offset+=1000){const r=await db.from('publish_requests').select('id,package_snapshot,final_total').not('package_snapshot','is',null).order('id').range(offset,offset+999);assert.ifError(r.error);rows.push(...r.data.map(v=>({id:v.id,hash:digest({snapshot:v.package_snapshot,total:v.final_total})})));if(r.data.length<1000)break}return rows}
function checkMatrix(before,after){
 let checks=0;assert.deepEqual(plain(after.newsRates),plain(before.newsRates));assert.deepEqual(plain(after.extras),plain(before.extras));checks+=2
 for(const p of after.packages){const old=before.packages.find(v=>v.id===p.id),a=plain(p),b=plain(old);delete a.categoryPrices;delete b.categoryPrices;assert.deepEqual(a,b,'No package configuration or benefit may change');checks++
  if(!packageIds.includes(p.id))assert.deepEqual(plain(p),plain(old))
  for(const rate of after.newsRates){const intended=targets[rate.category]?.[packageIds.indexOf(p.id)],expected=intended??packagePrice(rate.price,old,rate.category);assert.equal(packagePrice(rate.price,p,rate.category),expected,`${p.id}/${rate.key}`);const priced=priceIndividualPackage(rate.price,p,[],0,rate.category);assert.equal(priced.total,Math.round(expected*100));if(p.fixedPrice==null)assert.equal(priced.base+priced.surcharge,priced.subtotal);checks++}
 }
 const basic=after.packages.find(p=>p.id==='v2_basic'),reach=after.packages.find(p=>p.id==='v2_reach')
 assert.equal(priceIndividualPackage(399,basic,[{id:'video',price:400}],10,'appointment').total,98910);checks++
 assert.equal(priceIndividualPackage(399,reach,[],10,'certs').total,80910);checks++
 assert.deepEqual(plain(validateCatalog(after)),plain(after));checks++
 for(const override of [{unknown:500},{appointment:-1},{appointment:0},{appointment:1.001},{appointment:'699'},{appointment:Infinity}]){const bad=structuredClone(after);bad.packages[0].categoryPrices=override;assert.throws(()=>validateCatalog(bad));checks++}
 const badBudget=structuredClone(after);badBudget.packages[0].sponsoredCampaignBudget=500;badBudget.packages[0].categoryPrices.appointment=100;assert.throws(()=>validateCatalog(badBudget));checks++
 assert.equal(packageStartingPrice(after,basic),399);checks++
 return checks
}
const mode=process.argv[2]??'prepare'
if(mode==='prepare'){
 const s=await state(),r=await db.rpc('individual_catalog_read');assert.ifError(r.error)
 const before=plain(validateCatalog(r.data.document));assert.deepEqual(plain(validateCatalog(s.draft)),before,'Unpublished admin changes must be reviewed before this update')
 const proposed=structuredClone(before)
 for(const [i,id]of packageIds.entries()){const p=proposed.packages.find(p=>p.id===id);p.categoryPrices={...p.categoryPrices,...Object.fromEntries(Object.entries(targets).map(([category,prices])=>[category,prices[i]]))}}
 const after=plain(validateCatalog(proposed)),checks=checkMatrix(before,after)
 write('before',{state:s,published:r.data,snapshots:await snapshots()});write('approved-document',after);write('local-tests',{passed:true,checks,targets,only_first_two_changed:true,all_other_prices_and_benefits_unchanged:true})
 console.log(JSON.stringify({prepared:true,checks,previous_version:r.data.version,targets}))
}else if(mode==='publish'){
 const backup=read('before'),doc=plain(validateCatalog(read('approved-document'))),s=await state();assert.equal(s.revision,backup.state.revision,'Concurrent admin change detected');assert.equal(s.published_release_id,backup.state.published_release_id);assert.deepEqual(s.draft,backup.state.draft);checkMatrix(plain(validateCatalog(backup.published.document)),doc)
 // Ensure the deployed validator preserves the new optional field before publishing any prices.
 const deployed=await(await fetch('https://nukhba.media/api/individual-catalog',{cache:'no-store'})).json();assert.equal(deployed.version,backup.published.version)
 const readyApi=createNukhbaClient({origin:'https://nukhba.media',partnerId:process.env.NUKHBA_PARTNER_ID,keyId:process.env.NUKHBA_KEY_ID,secret:process.env.NUKHBA_PARTNER_SECRET}),ready=await readyApi('catalog',{customerId:'qa-price-publication-readiness'});assert(ready.packages.every(p=>p.category_prices&&typeof p.category_prices==='object'),'Deploy category pricing support before publishing')
 const saved=await db.rpc('individual_catalog_save',{p_document:doc,p_expected:s.revision,p_actor:null});assert.ifError(saved.error)
 const published=await db.rpc('individual_catalog_publish',{p_expected:saved.data.revision,p_actor:null});assert.ifError(published.error);write('publication',published.data);console.log(JSON.stringify({published:true,...published.data}))
}else if(mode==='verify'){
 const backup=read('before'),expected=read('approved-document'),publication=read('publication'),native=await(await fetch('https://nukhba.media/api/individual-catalog',{cache:'no-store'})).json();assert.equal(native.version,publication.version);assert.deepEqual(plain(validateCatalog(native)),expected)
 const api=createNukhbaClient({origin:'https://nukhba.media',partnerId:process.env.NUKHBA_PARTNER_ID,keyId:process.env.NUKHBA_KEY_ID,secret:process.env.NUKHBA_PARTNER_SECRET}),customerId='qa-category-prices-'+crypto.randomUUID(),ids=[],quotes=[]
 try{
  const catalog=await api('catalog',{customerId});assert.equal(catalog.version,publication.version)
  for(const p of catalog.packages){const n=native.packages.find(n=>n.id===p.id);assert.deepEqual(p.benefits,n.benefits);assert.deepEqual(p.features,n.features);assert.equal(p.starts_from,Math.round(packageStartingPrice(native,n)*100));assert.deepEqual(p.category_prices,Object.fromEntries(Object.entries(n.categoryPrices??{}).map(([k,v])=>[k,v*100])))}
  const pub=catalog.publishers.find(p=>p.channels.length===4);assert(pub)
  for(const category of [...Object.keys(targets),'award'])for(const pkg of catalog.packages.filter(p=>!p.required_category||p.required_category===category)){
   const body={package_id:pkg.id,category,influencer_id:pub.id,channels:pkg.channels??pub.channels.slice(0,pkg.channel_count),catalog_version:catalog.version},q=await api('quotes',{customerId,body});ids.push(q.id)
   const wanted=packagePrice(newsPrice(native,category),native.packages.find(p=>p.id===pkg.id),category);assert.equal(q.snapshot.pricing.total,Math.round(wanted*100));quotes.push({category,package:pkg.id,total_sar:wanted})
  }
  await assert.rejects(api('quotes',{customerId,body:{package_id:'v2_basic',category:'graduation',influencer_id:pub.id,channels:[pub.channels[0]],catalog_version:backup.published.version}}),e=>e.status===409&&e.message==='CATALOG_CHANGED')
  const now=new Map((await snapshots()).map(r=>[r.id,r.hash]));for(const old of backup.snapshots)assert.equal(now.get(old.id),old.hash,'Historical order snapshot changed')
  const oldRelease=await db.from('individual_catalog_releases').select('document').eq('id',backup.state.published_release_id).single();assert.ifError(oldRelease.error);assert.deepEqual(oldRelease.data.document,backup.published.document)
  write('live-verification',{passed:true,version:catalog.version,quotes,all_benefits_unchanged:true,other_categories_unchanged:true,stale_catalog_rejected:true,historical_snapshots_preserved:backup.snapshots.length,previous_release_unchanged:true,orders_created:0,checkout_sessions_created:0,payments_created:0});console.log(JSON.stringify({passed:true,version:catalog.version,quotes:quotes.length,historical_snapshots_preserved:backup.snapshots.length}))
 }finally{if(ids.length){const removed=await db.from('partner_quotes').delete().in('id',ids).eq('partner_id',process.env.NUKHBA_PARTNER_ID).eq('customer_id',customerId);assert.ifError(removed.error)}}
}else throw Error('Use prepare, publish or verify')
