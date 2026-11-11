import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {NextResponse} from 'next/server.js';
const load=(file,resolve)=>{const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(resolve,exports);return exports};
const checks=[],callbacks=[],mail=[];let user=null,existing=null,created=0,updates=0,captcha=true,rate=true,passwordProof='email_not_confirmed',sessionFailure=false;
const db={auth:{admin:{
 createUser:async input=>{created++;assert.equal(input.email_confirm,true);user={id:'11111111-1111-4111-8111-111111111111',email:input.email,email_confirmed_at:'2026-11-07T10:00:00Z',user_metadata:input.user_metadata,app_metadata:input.app_metadata};return {data:{user}}},
 getUserById:async()=>({data:{user}}),
 updateUserById:async(id,input)=>{updates++;assert.equal(id,user.id);assert.equal(input.email_confirm,true);user={...user,app_metadata:{...user.app_metadata,...input.app_metadata},email_confirmed_at:'2026-11-07T10:01:00Z'};return {data:{user}}},
 generateLink:async input=>{assert.equal(input.type,'magiclink');return {data:{user,properties:{hashed_token:'private-server-fixture'}}}},
}},rpc:async()=>({data:existing}),from:()=>({update:()=>({eq:async()=>({error:null})})})};
const browser={auth:{verifyOtp:async input=>{assert.equal(input.token_hash,'private-server-fixture');return sessionFailure?{data:{user:null},error:{}}:{data:{user}}},signOut:async()=>{}}};
const notification=load('src/lib/first1saudi-signup-notification.ts',()=>({sendEmail:async(...args)=>{mail.push(args);return true}}));
const route=load('src/app/api/auth/sso/register/route.ts',name=>({
 'next/server':{NextResponse,after:fn=>callbacks.push(fn)},'@/lib/supabase-server':{createServiceRoleClient:async()=>db,createServerSupabaseClient:async()=>browser},'@/lib/turnstile':{verifyTurnstileToken:async()=>captcha},'@/lib/email-validation':{validateEmail:()=>({valid:true})},'@/lib/sso':{validSsoOrigin:r=>r.headers.get('origin')==='https://nukhba.media'},'@/lib/sso-attempt':{consumeSsoAttempt:async()=>rate},'@/lib/auth-password-proof':{provePassword:async()=>({code:passwordProof})},'@/lib/first1saudi-signup-notification':notification,
}[name]??(()=>{throw Error('Unexpected import '+name)})()));
const call=(origin='https://nukhba.media',body={email:'qa@example.invalid',password:'FixturePassword!123',fullName:'اسم <اختبار>',phone:'+966500000000'})=>route.POST(new Request('https://nukhba.media/api/auth/sso/register',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}));
assert.equal((await call('https://evil.invalid')).status,403);captcha=false;assert.equal((await call()).status,400);captcha=true;rate=false;assert.equal((await call()).status,429);rate=true;assert.equal(created,0);checks.push('Origin, CAPTCHA and rate checks run before any account/session mutation');
let response=await call();assert.equal(response.status,200);const result=await response.json();assert.equal(result.authenticated,true);assert(!JSON.stringify(result).includes('private-server-fixture'));assert.equal(created,1);assert.equal(mail.length,0);await callbacks.shift()();assert.equal(mail.length,1);assert.equal(mail[0][0],'first1saudi@gmail.com');assert(mail[0][2].includes('اسم &lt;اختبار&gt;'));assert(!mail[0][2].includes('أكد بريده'));checks.push('Registration creates the source-marked account and private session directly, then schedules the correct admin notification without sending an email code');
existing=user.id;assert.equal((await call()).status,409);assert.equal(updates,0);assert.equal(created,1);checks.push('Confirmed existing accounts retain their password/profile/source');
user={...user,email_confirmed_at:null,app_metadata:{}};passwordProof='invalid_credentials';assert.equal((await call()).status,409);assert.equal(updates,0);passwordProof='email_not_confirmed';assert.equal((await call()).status,200);assert.equal(updates,1);checks.push('Old pending signup requires its original password before direct completion; wrong password cannot activate it');
existing=null;sessionFailure=true;const before=callbacks.length;assert.equal((await call()).status,503);assert.equal(callbacks.length,before);checks.push('Session failure does not report successful registration or send a completion email');
// FirstSaudi code login is covered by first1-otp-brand-test.mjs.
fs.mkdirSync('../verification',{recursive:true});fs.writeFileSync('../verification/direct-auth-tests.json',JSON.stringify({passed:true,checks,emails_sent:0},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
