import assert from 'node:assert/strict';
import fs from 'node:fs';
const checks=[];
const endpoint='https://nukhba.media/api/auth/sso/code';
async function post(body,origin='https://nukhba.media'){return fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})}
assert.equal((await post({},'https://evil.invalid')).status,403);checks.push('Published FirstSaudi code handler rejects foreign origins');
assert.equal((await post({})).status,400);checks.push('New code handler is live; malformed authorization is rejected');
const r=await post({authorization_id:'smoke-test-authorization-only',email:'test@example.invalid'});assert.equal(r.status,400);assert((await r.json()).error.includes('التحقق الأمني'));checks.push('Production CAPTCHA remains required and sends no test message without verification');
const sso=await fetch('https://nukhba.media/auth/sso?authorization_id=smoke-test-authorization-only',{signal:AbortSignal.timeout(20000)});assert.equal(sso.status,200);const html=await sso.text();assert(html.includes('الدخول برمز عبر البريد'));assert(html.includes('أول سعودي'));checks.push('Published FirstSaudi login page includes the restored email-code option');
const nukhba=await fetch('https://nukhba.media/auth/login',{signal:AbortSignal.timeout(20000)});assert.equal(nukhba.status,200);assert((await nukhba.text()).includes('تواصل النخبة'));checks.push('Independent Nukhba login page retains its identity');
fs.writeFileSync('../production-smoke.json',JSON.stringify({passed:true,checks,emails_sent:0,checked_at:new Date().toISOString()},null,2));console.log(JSON.stringify({passed:true,checks}));
