// Exercise the changed handler with an isolated local CAPTCHA double. The live
// Cloudflare verifier and production configuration are never changed/bypassed.
// Code generation, Resend delivery, OTP verification and the WP callback are real.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {NextResponse} from 'next/server.js';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {Jar} from './auth-test-browser-jar.mjs';
process.loadEnvFile('C:/Users/sayed/influencers/.env.local');
process.env.SSO_UI_ORIGIN='https://nukhba.media';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert(url.includes('rbyglvwbojitxyazmgap'));assert(key&&anon);
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const email='sayedabdullah2006@gmail.com';
const existing=await admin.rpc('auth_user_id_by_email',{p_email:email});assert.ifError(existing.error);assert(existing.data,'Test owner must have an existing account');
const user=await admin.auth.admin.getUserById(existing.data);assert.ifError(user.error);assert(user.data.user.email_confirmed_at);
const load=(file,resolve)=>{const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(resolve,exports);return exports};
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s))return n(s+'.ts',c);throw e}}});
const templates=await import('../src/lib/email-templates.ts'),{withEmailBrand}=await import('../src/lib/email-brand.ts');
const sso=load('src/lib/sso.ts',()=>{throw Error('Unexpected import')});
const attempt=load('src/lib/sso-attempt.ts',name=>name==='node:crypto'?{createHash}:{createServiceRoleClient:async()=>admin});
const jar=new Jar(),authCookies=new Map(),checks=[];
const browser=createServerClient(url,anon,{cookies:{getAll:()=>[...authCookies.values()],setAll:items=>items.forEach(item=>authCookies.set(item.name,item))}});
let otp,providerId;
const marker='F1OTP-LIVE-'+new Date().toISOString().replace(/\D/g,'').slice(0,14);
const route=load('src/app/api/auth/sso/code/route.ts',name=>({
 'next/server':{NextResponse},'@/lib/sso':sso,'@/lib/supabase-server':{createServiceRoleClient:async()=>admin},'@/lib/turnstile':{verifyTurnstileToken:async()=>true},'@/lib/email-validation':load('src/lib/email-validation.ts',()=>({})),'@/lib/sso-attempt':attempt,
 '@/lib/email':{sendLoginCode:async args=>{
   assert.equal(args.email,email);assert.equal(args.brand,'first1saudi');otp=args.code;
   const mail=withEmailBrand({brand:args.brand},()=>templates.loginCodeToClient(args));
   const r=await fetch(url+'/functions/v1/send-email',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({to:args.email,brand:args.brand,subject:mail.subject+' — اختبار '+marker,html:mail.html,notificationKey:marker}),signal:AbortSignal.timeout(45000)});
   const result=await r.json();providerId=result.data?.id;return r.ok&&result.ok===true;
 }},
}[name]??(()=>{throw Error('Unexpected import '+name)})()));
try{
 let location='https://www.first1saudi.net/services/auth/start?return=%2Fservices%2Faccount',response,id;
 for(let i=0;i<8;i++){
   response=await jar.get(location);
   const next=response.headers.get('location');if(!next)break;
   location=new URL(next,location).href;id=new URL(location).searchParams.get('authorization_id');if(id)break;
 }
 assert(id,'Authorization must originate from FirstSaudi');
 response=await route.POST(new Request('https://nukhba.media/api/auth/sso/code',{method:'POST',headers:{Origin:'https://nukhba.media','Content-Type':'application/json','x-forwarded-for':'127.0.0.1'},body:JSON.stringify({email,authorization_id:id,captchaToken:'local-test-double'})}));
 assert.equal(response.status,200);assert(otp&&providerId);checks.push('Changed handler sends a real FirstSaudi-branded login code through the live Resend transport');
 const signed=await browser.auth.verifyOtp({email,token:otp,type:'email'});otp=undefined;assert.ifError(signed.error);assert.equal(signed.data.user.id,existing.data);checks.push('Real Supabase OTP verification creates the expected isolated owner session');
 response=await fetch('https://nukhba.media/api/oauth/resume',{method:'POST',headers:{Origin:'https://nukhba.media','Content-Type':'application/json',Cookie:[...authCookies.values()].map(c=>c.name+'='+c.value).join('; ')},body:JSON.stringify({authorization_id:id}),signal:AbortSignal.timeout(45000)});
 assert.equal(response.status,200);location=(await response.json()).redirect;assert.equal(new URL(location).origin,'https://first1saudi.net');assert.equal(new URL(location).pathname,'/services/auth/callback');
 for(let i=0;i<8;i++){response=await jar.get(location);if(response.status>=300&&response.status<400){location=new URL(response.headers.get('location'),location).href;continue}break}
 assert.equal(response.status,200);assert.equal(new URL(location).pathname,'/services/account');
 const html=await response.text(),match=html.match(/<script[^>]*id=["']f1o-config["'][^>]*>([\s\S]*?)<\/script>/);assert(match);const config=JSON.parse(match[1]);assert.equal(config.authenticated,true);assert.equal(config.profile.email,email);checks.push('Production OAuth resume and WordPress callback return the authenticated owner to /services/account');
 fs.writeFileSync('../live-auth-verification.json',JSON.stringify({passed:true,marker,providerId,checks,final_path:'/services/account',captcha:'Mocked only in locally loaded test handler; production verifier untouched',accounts_created:0,orders_created:0,checked_at:new Date().toISOString()},null,2));
 console.log(JSON.stringify({passed:true,marker,providerId,checks}));
}finally{
 otp=undefined;
 if(jar.cookies.length){const r=await jar.get('https://www.first1saudi.net/services/auth/logout'),html=await r.text(),csrf=html.match(/name="csrf" value="([a-f0-9]+)"/);if(csrf)await jar.get('https://www.first1saudi.net/services/auth/logout',{method:'POST',headers:{Origin:'https://www.first1saudi.net','Content-Type':'application/x-www-form-urlencoded'},body:'csrf='+csrf[1]})}
 await browser.auth.signOut({scope:'local'});
 authCookies.clear();jar.cookies=[];
}
