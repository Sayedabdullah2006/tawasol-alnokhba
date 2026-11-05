import {deliverCustomerMail} from '../_shared/customer-email-delivery.ts'
import {serviceMailRequest,mailIdentity,prepareCustomerMail,customerMailStatus,customerMailAttachments} from '../_shared/customer-email-transport.ts'
// Supabase Edge Function: send-email
// Sends transactional emails through Resend.
// Reads `Resend_Key` from function secrets — set with:
//   supabase secrets set Resend_Key=re_xxx
//
// Deploy:
//   npx supabase functions deploy send-email --no-verify-jwt
//
// We use --no-verify-jwt because Next.js calls it server-to-server with the
// service-role key in its own client; the function itself is locked down by
// the secret being non-public.

const FROM_EMAIL = 'Nukhba Platform <noreply@nukhba.media>'
const REPLY_TO_EMAIL = 'support@nukhba.media'

// تحويل HTML إلى نص بسيط
function htmlToPlainText(html: string): string {
  return html
    // إزالة CSS و Scripts
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    // تحويل العناوين
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
    // تحويل الفقرات
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    // تحويل الأسطر الجديدة
    .replace(/<br[^>]*>/gi, '\n')
    // تحويل الروابط
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    // تحويل القوائم
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, '')
    // إزالة جميع HTML tags
    .replace(/<[^>]*>/g, '')
    // تنظيف المساحات
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // تنظيف الأسطر المتعددة
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()
}

interface Payload {
  brand?: 'nukhba'|'first1saudi'
  requestId?: string
  notificationKey?: string
  action?: 'preview'|'brand_status'
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  cc?: string | string[]
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}

Deno.serve(async (req) => {
  console.log('=== send-email function called ===')
  console.log('Method:', req.method)

  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method)
    return new Response('Method not allowed', { status: 405 })
  }

  console.log('Checking for API key...')
  const apiKey = Deno.env.get('Resend_Key') || Deno.env.get('RESEND_KEY') || Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('No API key found! Checked: Resend_Key, RESEND_KEY, RESEND_API_KEY')
    return new Response(JSON.stringify({ error: 'Resend_Key secret not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }


  let payload: Payload
  try {
    console.log('Parsing JSON body...')
    payload = await req.json()
    console.log('JSON parsed successfully:', {
      to: payload.to,
      subject: payload.subject,
      hasHtml: !!payload.html
    })
  } catch (error) {
    console.error('JSON parsing failed:', error)
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const internal=serviceMailRequest(req,key=>Deno.env.get(key))
  if((payload.brand==='first1saudi'||payload.requestId||payload.notificationKey||payload.action)&&!internal)return Response.json({error:'UNAUTHORIZED'},{status:401})
  if(payload.action==='brand_status')return Response.json(await customerMailStatus(payload.brand==='first1saudi'?'first1saudi':'nukhba',key=>Deno.env.get(key)))
  try {payload=await prepareCustomerMail(payload as unknown as Record<string,unknown>,key=>Deno.env.get(key)) as unknown as typeof payload} catch {return Response.json({error:'EMAIL_ORDER_CONTEXT_UNAVAILABLE'},{status:409})}
  const identity=mailIdentity(payload.brand==='first1saudi'?'first1saudi':'nukhba',key=>Deno.env.get(key))

  if (!payload.to || !payload.subject || !payload.html) {
    return new Response(JSON.stringify({ error: 'Missing to/subject/html' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // تحويل HTML إلى نص بسيط
  const plainText = htmlToPlainText(payload.html)

  const requestBody = {
    from: identity.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: plainText, // إضافة النسخة النصية البسيطة
    reply_to: identity.brand.id==='first1saudi'?identity.replyTo:payload.replyTo || REPLY_TO_EMAIL,
    cc: payload.cc, // إضافة CC للرسائل
    attachments: customerMailAttachments(identity.brand.id,payload.attachments?.map(item => ({
      filename: item.filename,
      content: item.content,
      content_type: item.contentType,
    }))),
    headers: {
      'X-Mailer': 'Nukhba-Platform/2.0',
      'X-Priority': '3',
      'List-Unsubscribe': '<mailto:unsubscribe@nukhba.media>, <https://nukhba.media/unsubscribe>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply',
      'X-Entity-Ref-ID': 'nukhba-platform',
      'Message-ID': `<${Date.now()}-${Math.random().toString(36).substr(2, 9)}@nukhba.media>`,
      'Date': new Date().toUTCString(),
      'MIME-Version': '1.0',
      'X-Feedback-ID': 'notifications:nukhba:platform',
      'Return-Path': 'bounces@nukhba.media',
      'Organization': 'Tawasol Al-Nokhba - تواصل النخبة',
      'X-Campaign-Name': 'transactional',
      'X-SES-Configuration-Set': 'nukhba-transactional',
      'Precedence': 'bulk',
      'X-MC-Track': 'opens,clicks'
    }
  }

  console.log('Resend API request:', {
    from: identity.from,
    to: payload.to,
    subject: payload.subject,

  })

  if(identity.brand.id==='first1saudi'){
    requestBody.headers={
      'Auto-Submitted':'auto-generated','X-Auto-Response-Suppress':'All',
      'Organization':identity.brand.name,'X-Mailer':'FirstSaudi-Notifications/1.0',
      'List-Help':'<https://first1saudi.net/contact>',
      'List-Unsubscribe':'<mailto:info@first1saudi.net>',
      'Message-ID':`<${crypto.randomUUID()}@first1saudi.net>`,
    } as unknown as typeof requestBody.headers
  }
  if(payload.action==='preview')return Response.json({ok:true,preview:true,brand:identity.brand.id,request:requestBody})

  const r = await deliverCustomerMail(requestBody,key=>Deno.env.get(key),identity.key!,payload.notificationKey)

  const data = await r.json().catch(() => ({}))

  if (!r.ok) {
    console.error('Resend API error:', {
      status: r.status,
      statusText: r.statusText,
      data,
      headers: Object.fromEntries(r.headers)
    })
  } else {
    console.log('Resend API success:', data)
  }

  return new Response(JSON.stringify({ ok: r.ok, status: r.status, data }), {
    status: r.ok ? 200 : r.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
