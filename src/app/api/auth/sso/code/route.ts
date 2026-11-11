import { NextResponse } from 'next/server'
import { validSsoOrigin } from '@/lib/sso'
import { authorizationId } from '@/lib/sso'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { validateEmail } from '@/lib/email-validation'
import { consumeSsoAttempt } from '@/lib/sso-attempt'
import { sendLoginCode } from '@/lib/email'

// This endpoint belongs only to the FirstSaudi portal. Never accept a sender
// identity from the browser or change the independent Nukhba login transport.
export async function POST(request: Request) {
  const headers={'Cache-Control':'private, no-store'}
  if (!validSsoOrigin(request)) return NextResponse.json({ error: 'طلب غير مسموح' }, { status: 403,headers })
  try {
    const raw=await request.text()
    if(raw.length>16000)return NextResponse.json({error:'الطلب أكبر من المسموح'},{status:413,headers})
    const body=JSON.parse(raw),email=String(body.email??'').trim().toLowerCase()
    try{authorizationId(body.authorization_id)}catch{return NextResponse.json({error:'أعد فتح صفحة الدخول من أول سعودي.'},{status:400,headers})}
    if(!validateEmail(email).valid)return NextResponse.json({error:'تحقق من البريد الإلكتروني.'},{status:400,headers})
    if(!await verifyTurnstileToken(body.captchaToken,request.headers.get('x-forwarded-for')?.split(',')[0].trim()))return NextResponse.json({error:'تعذر التحقق الأمني. أعد المحاولة.'},{status:400,headers})
    if(!await consumeSsoAttempt(email,request))return NextResponse.json({error:'محاولات كثيرة. انتظر قليلًا قبل المحاولة مجددًا.'},{status:429,headers:{...headers,'Retry-After':'900'}})
    const db=await createServiceRoleClient()
    const existing=await db.rpc('auth_user_id_by_email',{p_email:email})
    if(existing.error)throw Error('ACCOUNT_LOOKUP_UNAVAILABLE')
    if(existing.data){
      const account=await db.auth.admin.getUserById(existing.data)
      if(account.error)throw Error('ACCOUNT_LOOKUP_UNAVAILABLE')
      if(account.data.user?.email_confirmed_at){
        const link=await db.auth.admin.generateLink({type:'magiclink',email})
        const code=link.data?.properties?.email_otp
        if(link.error||!code)throw Error('LOGIN_CODE_UNAVAILABLE')
        if(!await sendLoginCode({email,code,ttlMinutes:60,brand:'first1saudi'}))throw Error('LOGIN_MAIL_UNAVAILABLE')
      }
    }
    return NextResponse.json({success:true,message:'إن كان البريد مسجلًا ومؤكدًا، سيصلك رمز الدخول من أول سعودي خلال دقائق.'},{headers})
  }catch{
    return NextResponse.json({error:'تعذر إرسال رمز الدخول الآن. أعد المحاولة أو استخدم كلمة المرور.'},{status:503,headers})
  }
}
