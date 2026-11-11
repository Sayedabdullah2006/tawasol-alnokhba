import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {NextResponse} from 'next/server.js';
const load=(file,resolve)=>{const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(resolve,exports);return exports};
const checks=[],mail=[];let captcha=true,rate=true,existing='fixture',confirmed=true,generated=0,sendOk=true,lookupError=false;
const db={rpc:async()=>({data:existing,error:lookupError?{}:null}),auth:{admin:{getUserById:async()=>({data:{user:{email_confirmed_at:confirmed?'2026-11-07':null}}}),generateLink:async()=>{generated++;return {data:{properties:{email_otp:'12345678'}}}}}}};
const sso=load('src/lib/sso.ts',()=>{throw Error('Unexpected import')});
const route=load('src/app/api/auth/sso/code/route.ts',name=>({
 'next/server':{NextResponse},'@/lib/sso':sso,'@/lib/supabase-server':{createServiceRoleClient:async()=>db},'@/lib/turnstile':{verifyTurnstileToken:async()=>captcha},'@/lib/email-validation':{validateEmail:e=>({valid:/^[^@]+@[^@]+\.[^@]+$/.test(e)})},'@/lib/sso-attempt':{consumeSsoAttempt:async()=>rate},'@/lib/email':{sendLoginCode:async input=>{mail.push(input);return sendOk}},
}[name]??(()=>{throw Error('Unexpected import '+name)})()));
const call=(override={},origin='https://nukhba.media')=>route.POST(new Request('https://nukhba.media/api/auth/sso/code',{method:'POST',headers:{Origin:origin},body:JSON.stringify({email:' TEST@example.invalid ',authorization_id:'abcdefghijklmnop123456',...override})}));
assert.equal((await call({},'https://evil.invalid')).status,403);
assert.equal((await call({authorization_id:'bad'})).status,400);
assert.equal((await call({email:'bad'})).status,400);
captcha=false;assert.equal((await call()).status,400);captcha=true;
rate=false;assert.equal((await call()).status,429);rate=true;
assert.equal(generated,0);assert.equal(mail.length,0);checks.push('Origin, authorization syntax, email, CAPTCHA and rate guards precede code generation');
const known=await call();assert.equal(known.status,200);assert.equal(known.headers.get('cache-control'),'private, no-store');assert.equal(mail.length,1);assert.deepEqual(mail[0],{email:'test@example.invalid',code:'12345678',ttlMinutes:60,brand:'first1saudi'});assert(!JSON.stringify(await known.json()).includes('12345678'));checks.push('Only a confirmed existing account gets a FirstSaudi code; response never exposes it');
existing=null;const unknown=await call();assert.equal(unknown.status,200);assert.equal(mail.length,1);checks.push('Unknown accounts return the same public success shape without creating an account or sending mail');
existing='fixture';confirmed=false;assert.equal((await call()).status,200);assert.equal(mail.length,1);checks.push('Pending accounts are not confirmed by requesting a login code');
confirmed=true;sendOk=false;assert.equal((await call()).status,503);sendOk=true;lookupError=true;assert.equal((await call()).status,503);checks.push('Mail or lookup failure fails closed and offers the password alternative');
const original='../..//signup-notification-20261107/deploy/';
for(const file of ['src/app/api/auth/login-start/route.ts','src/app/auth/login/page.tsx','src/lib/email.ts','supabase/functions/_shared/customer-email-brand.ts'])assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync(original+file,'utf8'));
checks.push('Nukhba login handler, login UI, shared mail sender and brand definitions remain byte-identical');
fs.writeFileSync('../route-tests.json',JSON.stringify({passed:true,checks,real_emails_sent:0},null,2));console.log(JSON.stringify({passed:true,checks}));
