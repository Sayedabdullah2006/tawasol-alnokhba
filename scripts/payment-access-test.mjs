import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(fs.readFileSync('src/lib/payment-access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
async function run({metadata={request_id:'order'},owner='customer',role='client',requestId='order',stored=true,user=true}={}){
 const exported={}
 let lookup
 const query={select(){return this},eq(column,value){lookup=[column,value];return this},async single(){return {data:stored?{id:'order',user_id:owner,partner_id:null}:null}}}
 const auth={auth:{getUser:async()=>({data:{user:user?{id:'customer'}:null}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role}})})}
 vm.runInNewContext(source,{exports:exported,AbortSignal,fetch:async()=>Response.json({metadata}),require(name){
  if(name==='@/lib/supabase-server')return {createServerSupabaseClient:async()=>auth,createServiceRoleClient:async()=>({from:()=>query})}
  if(name==='@/lib/moyasar')return {buildAuthHeader:()=>'',MOYASAR_API_URL:'https://example.invalid'}
  throw Error(name)
 }})
 const result=await exported.canVerifyCustomerPayment('payment',requestId)
 return {result,lookup}
}
assert.equal((await run()).result,true)
assert.equal((await run({owner:'other'})).result,false)
assert.equal((await run({owner:'other',role:'admin'})).result,true)
assert.equal((await run({user:false})).result,false)
assert.equal((await run({metadata:{resource_type:'partner_order',request_id:'order'}})).result,false)
assert.equal((await run({metadata:{request_id:'different'}})).result,false)
const legacy=await run({metadata:{}});assert.equal(legacy.result,true);assert.equal(legacy.lookup[0],'moyasar_payment_id')
assert.equal((await run({metadata:{},stored:false})).result,false)
assert.equal((await run({metadata:{},requestId:'another'})).result,false)
console.log('PASS: 9 payment ownership cases, including stored legacy payments without metadata.')
