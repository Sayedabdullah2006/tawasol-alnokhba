import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendLoginCode } from '@/lib/email'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { validateEmail } from '@/lib/email-validation'
import { validSsoOrigin } from '@/lib/sso'
import { consumeSsoAttempt } from '@/lib/sso-attempt'
import { createClient } from '@supabase/supabase-js'
export async function POST(request:Request){
 if(!validSsoOrigin(request))return NextResponse.json({error:'طلب غير مسموح'},{status:403})
 try{
  const text=await request.text();if(text.length>16000)return NextResponse.json({error:'البيانات أكبر من المسموح'},{status:413})
  const body=JSON.parse(text),email=String(body.email??'').trim().toLowerCase(),password=String(body.password??''),name=String(body.fullName??'').trim(),phone=String(body.phone??'').replace(/[\s-]/g,'')
  if(!validateEmail(email).valid||password.length<10||password.length>128||!name||name.length>160||!/^\+\d{7,15}$/.test(phone))return NextResponse.json({error:'تحقق من البريد والاسم والجوال الدولي وكلمة المرور (10 أحرف على الأقل).'},{status:400})
  if(!await verifyTurnstileToken(body.captchaToken,request.headers.get('x-forwarded-for')?.split(',')[0].trim()))return NextResponse.json({error:'تعذر التحقق الأمني.'},{status:400})
  if(!await consumeSsoAttempt(email,request))return NextResponse.json({error:'محاولات كثيرة. انتظر قليلًا قبل المحاولة مجددًا.'},{status:429,headers:{'Retry-After':'900'}})
  const db=await createServiceRoleClient(),existing=await db.rpc('auth_user_id_by_email',{p_email:email})
  if(existing.error)throw Error('unavailable')
  let issueCode=!existing.data
  if(existing.data){
   const account=await db.auth.admin.getUserById(existing.data)
   if(account.error)throw Error('unavailable')
   if(!account.data.user?.email_confirmed_at){
    // Resend signup codes only after the pending account's password is proved.
    // Confirmed accounts never pass through signup or have credentials replaced.
    const verifier=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
    const proof=await verifier.auth.signInWithPassword({email,password})
    issueCode=proof.error?.code==='email_not_confirmed'
   }
  }
  if(issueCode){
   const generated=await db.auth.admin.generateLink({type:'signup',email,password,options:{data:{full_name:name,phone}}})
   if(generated.error||!generated.data.properties?.email_otp)throw Error('unavailable')
   if(!existing.data){const profile=await db.from('profiles').update({full_name:name,phone}).eq('id',generated.data.user.id);if(profile.error)throw Error('unavailable')}
   if(!await sendLoginCode({email,code:generated.data.properties.email_otp,ttlMinutes:60}))throw Error('unavailable')
  }
  // Same response for registered addresses. Existing credentials and profiles are never overwritten.
  return NextResponse.json({success:true,message:'إن أمكن إنشاء الحساب، سيصلك رمز التحقق. للحساب الموجود استخدم تسجيل الدخول.'},{headers:{'Cache-Control':'no-store'}})
 }catch{return NextResponse.json({error:'تعذر إرسال رمز التسجيل الآن. استخدم تسجيل الدخول إن كان لديك حساب.'},{status:503})}
}
