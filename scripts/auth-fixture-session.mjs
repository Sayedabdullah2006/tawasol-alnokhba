// Privileged setup for NEW disposable fixtures only. No public CAPTCHA setting
// or browser is modified. Real interactive password/CAPTCHA tests are separate.
import assert from 'node:assert/strict';
export async function fixtureSession(admin,client,email){
 assert(/^qa-[a-z0-9-]+@example\.invalid$/.test(email),'Only disposable QA fixture addresses are allowed');
 const link=await admin.auth.admin.generateLink({type:'magiclink',email});assert.ifError(link.error);
 const signed=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});assert.ifError(signed.error);return signed;
}
