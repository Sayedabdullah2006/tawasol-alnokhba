// Actual Auth/profile/session and public SSO callback. CAPTCHA is mocked only
// around the locally loaded registration handler, never disabled on production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import dotenv from 'dotenv';
import {NextResponse} from 'next/server.js';
import * as sdk from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {Jar} from './auth-test-browser-jar.mjs';
const env=dotenv.parse(fs.readFileSync('C:/Users/sayed/.codex/worktrees/partner-deploy/influencers/.env.local'));Object.assign(process.env,env);
const admin=sdk.createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const dir=path.join(process.env.USERPROFILE,'.codex/tmp/first1-direct-auth-20261107');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'fixture.json');
const out='../verification';fs.mkdirSync(out,{recursive:true});
const load=(file,resolve)=>{const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(resolve,exports);return exports};
const action=process.argv[2];
if(action==='prepare'){
 assert(!fs.existsSync(file));let uid,pendingId;const checks=[],callbacks=[],authJar=new Map();
 const browser=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...authJar.values()],setAll:items=>items.forEach(item=>authJar.set(item.name,item))}});
 const notifications=load('src/lib/first1saudi-signup-notification.ts',()=>({sendEmail:async()=>{throw Error('No preflight email')}}));
 const passwordProof=load('src/lib/auth-password-proof.ts',name=>name==='server-only'?{}:sdk);
 const route=load('src/app/api/auth/sso/register/route.ts',name=>({
  'next/server':{NextResponse,after:fn=>callbacks.push(fn)},'@/lib/supabase-server':{createServiceRoleClient:async()=>admin,createServerSupabaseClient:async()=>browser},'@/lib/turnstile':{verifyTurnstileToken:async()=>true},'@/lib/email-validation':load('src/lib/email-validation.ts',()=>({})),'@/lib/sso':{validSsoOrigin:r=>r.headers.get('origin')==='https://nukhba.media'},'@/lib/sso-attempt':{consumeSsoAttempt:async()=>true},'@/lib/auth-password-proof':passwordProof,'@/lib/first1saudi-signup-notification':notifications,
 }[name]??(()=>{throw Error(name)})()));
 const call=(email,password)=>route.POST(new Request('https://nukhba.media/api/auth/sso/register',{method:'POST',headers:{Origin:'https://nukhba.media'},body:JSON.stringify({email,password,fullName:'اختبار التسجيل المباشر — حساب تجريبي',phone:'+966500000000'})}));
 try{
  const email='qa-first1direct-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomBytes(24).toString('base64url')+'Aa1!';
  const response=await call(email,password);uid=(await admin.rpc('auth_user_id_by_email',{p_email:email})).data;
  const responseBody=await response.json();assert.equal(response.status,200,JSON.stringify(responseBody));assert.equal(responseBody.authenticated,true);assert(uid);
  const current=await browser.auth.getUser();assert.ifError(current.error);assert.equal(current.data.user.id,uid);assert(current.data.user.email_confirmed_at);assert.equal(current.data.user.app_metadata.first1saudi_signup.source,'first1saudi.net');
  const profile=await admin.from('profiles').select('role').eq('id',uid).single();assert.ifError(profile.error);assert.equal(profile.data.role,'client');
  assert.equal(callbacks.length,1);assert.equal((await call(email,'WrongPassword!123')).status,409);checks.push('New registration directly establishes a real client session, without an email-code step; duplicate registration cannot replace its password');
  const pendingEmail='qa-first1pending-'+crypto.randomUUID()+'@example.invalid',pendingPass=crypto.randomBytes(24).toString('base64url')+'Aa1!';const pending=await admin.auth.admin.createUser({email:pendingEmail,password:pendingPass,email_confirm:false});assert.ifError(pending.error);pendingId=pending.data.user.id;
  assert.equal((await call(pendingEmail,'WrongPassword!123')).status,409);assert(!(await admin.auth.admin.getUserById(pendingId)).data.user.email_confirmed_at);
  assert.equal((await call(pendingEmail,pendingPass)).status,200);assert((await admin.auth.admin.getUserById(pendingId)).data.user.email_confirmed_at);assert.equal((await browser.auth.getUser()).data.user.id,pendingId);await browser.auth.signOut({scope:'global'});await admin.auth.admin.deleteUser(pendingId);pendingId=null;checks.push('Pending registration completes without email only with its correct original password; wrong password remains rejected');
  // Restore the main session through its proven password; no OTP email is sent.
  const actor=sdk.createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const signed=await actor.auth.signInWithPassword({email,password});assert.ifError(signed.error);await browser.auth.setSession(signed.data.session);
  fs.writeFileSync(file,JSON.stringify({uid,email,authCookies:[...authJar.values()]}),{mode:0o600});
  fs.writeFileSync(out+'/direct-auth-live-preflight.json',JSON.stringify({passed:true,checks,emails_sent:0,production_captcha_disabled:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,emails_sent:0}));
 }catch(error){if(uid)await admin.auth.admin.deleteUser(uid);throw error}finally{if(pendingId)await admin.auth.admin.deleteUser(pendingId)}
}else if(action==='production'){
 const fixture=JSON.parse(fs.readFileSync(file)),jar=new Jar(),checks=[];
 const resumeHeaders={Origin:'https://nukhba.media','Content-Type':'application/json',Cookie:fixture.authCookies.map(c=>c.name+'='+c.value).join('; ')};
 let response=await jar.get('https://www.first1saudi.net/services/auth/start?screen=register&return=%2Fservices%2Faccount');let location=response.headers.get('location');
 for(let attempt=0;attempt<4&&new URL(location).origin==='https://www.first1saudi.net';attempt++){response=await jar.get(location);location=response.headers.get('location')}
 let id=new URL(location).searchParams.get('authorization_id');if(!id){response=await fetch(location,{redirect:'manual'});id=new URL(response.headers.get('location')).searchParams.get('authorization_id')}assert(id);
 const resume=()=>fetch('https://nukhba.media/api/oauth/resume',{method:'POST',headers:resumeHeaders,body:JSON.stringify({authorization_id:id})});
 response=await resume();assert.equal(response.status,200);const result=await response.json();assert(!result.consent);assert.equal(new URL(result.redirect).origin,'https://first1saudi.net');location=result.redirect;checks.push('Production first-party OAuth continues directly to the fixed callback without a consent screen');
 for(let attempt=0;attempt<7;attempt++){response=await jar.get(location);if(response.status>=300&&response.status<400){location=new URL(response.headers.get('location'),location).href;continue}break}
 assert.equal(response.status,200);assert.equal(new URL(location).pathname,'/services/account');const html=await response.text();const match=html.match(/<script[^>]*id=["']f1o-config["'][^>]*>([\s\S]*?)<\/script>/);assert(match);const config=JSON.parse(match[1]);assert.equal(config.authenticated,true);assert.equal(config.profile.email,fixture.email);checks.push('Actual WordPress callback creates the correct authenticated FirstSaudi account and lands directly on its account dashboard');
 const key=crypto.createHash('sha256').update(JSON.stringify([['first1saudi@gmail.com'],'first1saudi-signup:'+fixture.uid])).digest('hex');const receipt=async()=>{const r=await admin.from('customer_email_deliveries').select('state,provider_id,attempt_id,updated_at').eq('delivery_key',key).maybeSingle();assert.ifError(r.error);return r.data};
 let sent;for(let attempt=0;attempt<20;attempt++){sent=await receipt();if(sent?.state==='sent')break;await new Promise(r=>setTimeout(r,1000))}assert.equal(sent?.state,'sent');assert(sent.provider_id);await resume();await new Promise(r=>setTimeout(r,2200));const repeated=await receipt();assert.equal(repeated.attempt_id,sent.attempt_id);assert.equal(repeated.provider_id,sent.provider_id);checks.push('One completion notification is accepted for first1saudi@gmail.com and subsequent login/resume does not resend it');
 const retired=await fetch('https://nukhba.media/api/auth/sso/code',{method:'POST',headers:{Origin:'https://nukhba.media'}});assert.equal(retired.status,410);checks.push('Published FirstSaudi code-login endpoint is retired');
 fixture.wpCookies=jar.cookies;fs.writeFileSync(file,JSON.stringify(fixture),{mode:0o600});
 fs.writeFileSync(out+'/smooth-production.json',JSON.stringify({passed:true,checks,provider_id:sent.provider_id,test_admin_emails_sent:1,user_email_codes_sent:0,final_path:'/services/account',checked_at:new Date().toISOString()},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,final_path:'/services/account',test_admin_emails_sent:1,user_email_codes_sent:0}));
}else if(action==='cleanup'){
 const fixture=JSON.parse(fs.readFileSync(file));assert(fixture.email.startsWith('qa-first1direct-')&&fixture.email.endsWith('@example.invalid'));const jar=new Jar();jar.cookies=fixture.wpCookies??[];
 if(jar.cookies.length){const screen=await jar.get('https://www.first1saudi.net/services/auth/logout');const html=await screen.text(),csrf=html.match(/name="csrf" value="([a-f0-9]+)"/);if(csrf)await jar.get('https://www.first1saudi.net/services/auth/logout',{method:'POST',headers:{Origin:'https://www.first1saudi.net','Content-Type':'application/x-www-form-urlencoded'},body:'csrf='+csrf[1]})}
 const browser=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>fixture.authCookies,setAll:()=>{}}});await browser.auth.oauth.revokeGrant('22885502-0f8f-48e1-9fe4-c21e969a6ab9');await browser.auth.signOut({scope:'global'});
 const user=await admin.auth.admin.getUserById(fixture.uid);assert.ifError(user.error);assert.equal(user.data.user.email,fixture.email);assert.ifError((await admin.auth.admin.deleteUser(fixture.uid)).error);fs.unlinkSync(file);fs.writeFileSync(out+'/direct-cleanup.json',JSON.stringify({passed:true,central_test_account_removed:true,session_and_grant_revoked:true,private_fixture_removed:true,wordpress_test_subscriber:'Retained with deleted central identity and revoked session; no orders or payments.'},null,2));console.log(JSON.stringify({cleaned:true}));
}else throw Error('Use prepare, production or cleanup');
