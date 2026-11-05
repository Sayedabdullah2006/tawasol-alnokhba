// Live transport verification only: every request uses the service-only preview/status action.
import fs from 'node:fs';import assert from 'node:assert/strict';import dotenv from 'dotenv';import {createClient} from '@supabase/supabase-js';
dotenv.config({path:'.env.local',quiet:true});const out='output/partners/email-brand',db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),checks=[],statuses=[];
for(const name of ['send-email','send-enhanced-email']){
 for(const brand of ['nukhba','first1saudi']){
  const html=fs.readFileSync(out+'/'+brand+'-review.html','utf8'),payload={action:'preview',brand,to:'qa@example.invalid',subject:brand==='first1saudi'?'مراجعة طلب · شبكة أول سعودي':'مراجعة طلب · تواصل النخبة',html};
  const result=await db.functions.invoke(name,{body:payload});if(result.error)throw Error('Preview failed: '+name+' '+brand+' '+result.error.message);
  assert.equal(result.data.preview,true);assert.equal(result.data.brand,brand);const mail=result.data.request;
  if(brand==='first1saudi'){assert.equal(mail.from,'شبكة أول سعودي <info@first1saudi.net>');assert.equal(mail.reply_to,'info@first1saudi.net');assert(!mail.html.includes('nukhba.media'));assert(!JSON.stringify(mail.headers).includes('nukhba'));assert(mail.text.includes('شبكة أول سعودي'));}
  else {assert.equal(mail.from,'Nukhba Platform <noreply@nukhba.media>');assert(mail.html.includes('تواصل النخبة'));}
  checks.push({function:name,brand,preview:true,sender:mail.from,reply_to:mail.reply_to});
 }
 const forbidden=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview',brand:'first1saudi'})});assert.equal(forbidden.status,401);
 const status=await db.functions.invoke(name,{body:{action:'brand_status',brand:'first1saudi'}});assert.ifError(status.error);statuses.push({function:name,...status.data});
}
const report={passed:true,checked_at:new Date().toISOString(),previews:checks,unauthenticated_preview_blocked:true,sender_status:statuses,provider_domain_list_restricted:statuses.every(s=>s.provider_error==='restricted_api_key'),emails_sent:0,payments_created:0,production_orders_changed:0};fs.writeFileSync(out+'/live-preview.json',JSON.stringify(report,null,2));console.log(report);
