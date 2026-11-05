import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendLoginCode } from '@/lib/email'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { validateEmail } from '@/lib/email-validation'
import { validSsoOrigin } from '@/lib/sso'
import { consumeSsoAttempt } from '@/lib/sso-attempt'
export async function POST(request:Request){
 if(!validSsoOrigin(request))return NextResponse.json({error:'طلب غير مسموح'},{status:403})
 try{
  const raw=await request.text();if(raw.length>16000)return NextResponse.json({error:'بيانات أكبر من المسموح'},{status:413})
  const body=JSON.parse(raw),email=String(body.email??'').trim().toLowerCase()
  if(!validateEmail(email).valid)return NextResponse.json({error:'تحقق من البريد الإلكتروني'},{status:400})
  if(!await verifyTurnstileToken(body.captchaToken,request.headers.get('x-forwarded-for')?.split(',')[0].trim()))return NextResponse.json({error:'تعذر التحقق الأمني'},{status:400})
  if(!await consumeSsoAttempt(email,request))return NextResponse.json({error:'محاولات كثيرة. انتظر قبل المحاولة مجددًا.'},{status:429,headers:{'Retry-After':'900'}})
  const db=await createServiceRoleClient(),existing=await db.rpc('auth_user_id_by_email',{p_email:email})
  if(existing.error)throw Error('unavailable')
  if(existing.data){
   const user=await db.auth.admin.getUserById(existing.data)
   // Passwordless login does not activate a pre-existing unconfirmed password account.
   if(user.data.user?.email_confirmed_at){
    const link=await db.auth.admin.generateLink({type:'magiclink',email})
    if(link.error||!link.data.properties?.email_otp)throw Error('unavailable')
    if(!await sendLoginCode({email,code:link.data.properties.email_otp,ttlMinutes:60,brand:'first1saudi'}))throw Error('unavailable')
   }
  }
  return NextResponse.json({success:true,message:'إن كان الحساب مؤكدًا، سيصلك رمز الدخول.'},{headers:{'Cache-Control':'no-store'}})
 }catch{return NextResponse.json({error:'تعذر إرسال رمز الدخول الآن.'},{status:503})}
}
