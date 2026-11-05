// Run ONLY after the authorized provider CAPTCHA setting has been saved.
// Public password requests must fail without a valid challenge. Real interactive
// challenge completion is a separate physical-device test.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';import dotenv from 'dotenv';import {createClient} from '@supabase/supabase-js';
dotenv.config({path:'.env.local',quiet:true});const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}),email='qa-provider-captcha-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomBytes(24).toString('base64url')+'aA1!';let id;const checks=[];
try{
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(made.error);id=made.data.user.id;
 for(const options of [undefined,{captchaToken:'deliberately-invalid-captcha'}]){const result=await client.auth.signInWithPassword({email,password,options});assert.equal(result.data.session,null);assert.equal(result.error?.code,'captcha_failed')}
 checks.push('provider rejects a correct public password when the CAPTCHA is absent or invalid; neither request establishes a session');
 const previous=await client.auth.getSession();assert.equal(previous.data.session,null);checks.push('failed challenges leave no authenticated browser/provider session');
 fs.writeFileSync('output/partners/auth-goal-20261105/provider-captcha-tests.json',JSON.stringify({success:true,checks,production_auth:true,valid_interactive_captcha_tested:false,emails:0,payments:0},null,2));console.log(JSON.stringify({success:true,checks:checks.length}));
}catch(e){console.error('PROVIDER_CAPTCHA_TEST_FAILED: '+e.name);process.exitCode=1}finally{await client.auth.signOut({scope:'global'});if(id)await admin.auth.admin.deleteUser(id)}
