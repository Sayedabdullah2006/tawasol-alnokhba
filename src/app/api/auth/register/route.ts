import { NextResponse } from 'next/server'
import { createServiceRoleClient,createServerSupabaseClient } from '@/lib/supabase-server'
import { sendWelcomeEmail } from '@/lib/email'
import { validateEmail } from '@/lib/email-validation'
import { verifyTurnstileToken } from '@/lib/turnstile'
import {validSsoOrigin} from '@/lib/sso'
import {consumeSsoAttempt} from '@/lib/sso-attempt'

export async function POST(request: Request) {
  if(!validSsoOrigin(request))return NextResponse.json({error:'طلب غير مسموح'},{status:403})
  try {
    const raw=await request.text()
    if(raw.length>16000)return NextResponse.json({error:'البيانات أكبر من المسموح'},{status:413})
    let body
    try{body=JSON.parse(raw)}catch{return NextResponse.json({error:'تحقق من بيانات التسجيل'},{status:400})}
    const {email,password,fullName,phone,captchaToken}=body??{}
    if(typeof email!=='string'||typeof password!=='string'||typeof fullName!=='string'||typeof phone!=='string'||!fullName.trim()||fullName.length>160||email.length>254||password.length<6||password.length>128||phone.length>32)return NextResponse.json({error:'تحقق من بيانات التسجيل وكلمة المرور'},{status:400})
    const normalizedPhone=phone.replace(/[\s-]/g,'')
    if(!/^\+\d{6,15}$/.test(normalizedPhone)&&!/^05\d{8}$/.test(normalizedPhone))return NextResponse.json({error:'رقم جوال غير صالح'},{status:400})
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    if(!await verifyTurnstileToken(captchaToken,ip))return NextResponse.json({error:'فشل التحقق الأمني — أعد المحاولة'},{status:400})
    const emailCheck=validateEmail(email)
    if(!emailCheck.valid)return NextResponse.json({error:emailCheck.error??'البريد غير صحيح'},{status:400})
    if(!await consumeSsoAttempt(email,request))return NextResponse.json({error:'محاولات كثيرة. انتظر قليلًا قبل المحاولة مجددًا.'},{status:429,headers:{'Retry-After':'900'}})
    const normalizedEmail=email.trim().toLowerCase(),supabase=await createServiceRoleClient()
    // Preserve native registration's existing confirmed-email policy. The server
    // establishes the new session without consuming CAPTCHA a second time.
    const {data,error}=await supabase.auth.admin.createUser({email:normalizedEmail,password,email_confirm:true,user_metadata:{full_name:fullName.trim()}})
    if(error||!data?.user){
      if(error?.code==='email_exists'||error?.message.toLowerCase().includes('already been registered'))return NextResponse.json({error:'هذا البريد مسجل مسبقاً. استخدم تسجيل الدخول.'},{status:409})
      // Auth may report the unique-email race as a generic database error.
      // Classify the conflict only; never issue a session for an existing user.
      const existing=await supabase.rpc('auth_user_id_by_email',{p_email:normalizedEmail})
      if(!existing.error&&existing.data)return NextResponse.json({error:'هذا البريد مسجل مسبقاً. استخدم تسجيل الدخول.'},{status:409})
      return NextResponse.json({error:'تعذر إنشاء الحساب الآن. أعد المحاولة.'},{status:503})
    }
    const profile=await supabase.from('profiles').upsert({id:data.user.id,full_name:fullName.trim(),phone:normalizedPhone,role:'client'})
    if(profile.error)return NextResponse.json({error:'تم إنشاء حسابك، لكن تعذر إكمال إعداده. استخدم تسجيل الدخول للمتابعة.'},{status:503})
    // The magic-link hash stays entirely server-side. No email/code is sent for
    // this one-time session establishment; ownership follows this fresh signup.
    const link=await supabase.auth.admin.generateLink({type:'magiclink',email:normalizedEmail})
    if(link.error||!link.data.properties?.hashed_token)return NextResponse.json({error:'تم إنشاء حسابك. استخدم تسجيل الدخول للمتابعة.'},{status:503})
    const browser=await createServerSupabaseClient(),signed=await browser.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'})
    if(signed.error||signed.data.user?.id!==data.user.id){
      if(signed.data.user)await browser.auth.signOut({scope:'local'})
      return NextResponse.json({error:'تم إنشاء حسابك. استخدم تسجيل الدخول للمتابعة.'},{status:503})
    }
    // A welcome-email outage must not turn successful account/session creation
    // into a false failure or tempt a duplicate signup.
    try{await sendWelcomeEmail({email:normalizedEmail,clientName:fullName.trim()})}catch{console.warn('WELCOME_EMAIL_UNAVAILABLE')}
    return NextResponse.json({success:true,authenticated:true,userId:data.user.id},{headers:{'Cache-Control':'private, no-store'}})
  } catch {
    return NextResponse.json({error:'تعذر إكمال التسجيل الآن. أعد المحاولة.'},{status:503})
  }
}
