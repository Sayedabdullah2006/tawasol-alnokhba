/** Local operator tool. Never upload this or .env files to WordPress. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import dotenv from 'dotenv';import {createClient} from '@supabase/supabase-js';
dotenv.config({path:'.env.local',quiet:true});const env=dotenv.parse(fs.readFileSync('.env.first1saudi-acceptance'));const partner=JSON.parse(env.NUKHBA_SANDBOX_CLIENT_JSON);if(!partner.sandbox_only||!partner.id.startsWith('awwal-saudi-qa-'))throw Error('Sandbox partner required');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),[action,id,file]=process.argv.slice(2);const check=r=>{if(r.error)throw Error(r.error.code??'DATABASE_FAILED');return r.data};
try{
 if(action==='revoke'){
  const railway=JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE,'.railway','config.json'),'utf8'));const variables={p:'037f3508-21f6-409c-84e3-ca707e029bc8',s:'ae91c100-a641-4e5d-8450-7d06347f717a',e:'bca1fa27-e68b-4046-be04-6be161c223a0'};
  const request=async(query,vars)=>{const r=await fetch('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+railway.user.accessToken},body:JSON.stringify({query,variables:vars})});const b=await r.json();if(b.errors)throw Error('RAILWAY_REQUEST_FAILED');return b.data};
  const current=(await request('query($p:String!,$s:String!,$e:String!){variables(projectId:$p,serviceId:$s,environmentId:$e)}',variables)).variables;
  if(current.PARTNER_PAYMENT_MODE!=='live')throw Error('PRODUCTION_MODE_UNEXPECTED');const clients=JSON.parse(current.PARTNER_SANDBOX_CLIENTS_JSON||'[]').filter(c=>c.id!==partner.id);
  await request('mutation($input:VariableUpsertInput!){variableUpsert(input:$input)}',{input:{projectId:variables.p,serviceId:variables.s,environmentId:variables.e,name:'PARTNER_SANDBOX_CLIENTS_JSON',value:JSON.stringify(clients),skipDeploys:false}});console.log({revocationDeploymentRequested:true,partner:partner.id});
 }else if(action==='cleanup'){
  const orders=check(await db.from('partner_sandbox_orders').select('id').eq('partner_id',partner.id)),ids=orders.map(o=>o.id);
  if(ids.length){const files=check(await db.from('partner_sandbox_files').select('path').in('request_id',ids));if(files.length)check(await db.storage.from('partner-sandbox-files').remove(files.map(f=>f.path)));for(const table of ['partner_sandbox_invoices','partner_sandbox_payment_receipts','partner_sandbox_files','partner_sandbox_checkout_sessions'])check(await db.from(table).delete().in('request_id',ids));}
  check(await db.from('partner_sandbox_quotes').delete().eq('partner_id',partner.id));check(await db.from('partner_sandbox_orders').delete().eq('partner_id',partner.id));check(await db.from('partner_nonces').delete().eq('partner_id',partner.id));console.log({cleaned:orders.length,partner:partner.id,productionUntouched:true});
 }else{
  if(!/^[a-f0-9-]{36}$/i.test(id??''))throw Error('REQUEST_ID_REQUIRED');const order=check(await db.from('partner_sandbox_orders').select('id,partner_id').eq('id',id).eq('partner_id',partner.id).single());let update;
  if(action==='information')update={status:'info_requested',admin_info_request:'اختبار قبول: يرجى استكمال معلومات الخبر.'};
  else if(action==='review'){
   let images=[];if(file){const bytes=fs.readFileSync(file),object=`${partner.id}/${order.id}/${crypto.randomUUID()}`,mime=/\.png$/i.test(file)?'image/png':'image/jpeg';check(await db.storage.from('partner-sandbox-files').upload(object,bytes,{contentType:mime}));check(await db.from('partner_sandbox_files').insert({id:crypto.randomUUID(),request_id:id,path:object,name:path.basename(file),mime_type:mime,size:bytes.length,completed:true}));const signed=check(await db.storage.from('partner-sandbox-files').createSignedUrl(object,7200));images=[signed.signedUrl];}
   update={status:'content_review',proposed_content:'صياغة تجريبية لمراجعة العميل واعتمادها ضمن اختبار القبول المعزول.',proposed_images:images,post_reviews:{},content_sent_at:new Date().toISOString()};
  }else if(action==='complete')update={status:'completed',partner_deliverables:[{label:'مخرج اختبار قبول فقط',url:'https://first1saudi.net/'}]};else throw Error('USE_information_review_complete_cleanup_revoke');
  check(await db.from('partner_sandbox_orders').update({...update,updated_at:new Date().toISOString(),last_status_change:new Date().toISOString()}).eq('id',id).eq('partner_id',partner.id));console.log({updated:id,status:update.status,sandbox:true});
 }
}catch(error){console.error({error:String(error.message).slice(0,100)});process.exitCode=1}
