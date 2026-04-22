// انسخ والصق هذا الكود في Supabase Dashboard > Edge Functions
// اسم الدالة: send-enhanced-email

const FROM_EMAIL = 'Nukhba Platform <noreply@nukhba.media>'
const FROM_NAME = 'تواصل النخبة'
const REPLY_TO_EMAIL = 'support@nukhba.media'
const ORGANIZATION = 'Tawasol Al-Nokhba - تواصل النخبة'
const DOMAIN = 'nukhba.media'

interface EnhancedEmailPayload {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  cc?: string | string[]
  options?: {
    priority?: 'high' | 'normal' | 'low'
    category?: 'transactional' | 'notification' | 'marketing'
    emailId?: string
    validationScore?: number
    trackOpens?: boolean
    trackClicks?: boolean
  }
}

function generateMessageId(emailId?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  const id = emailId || `auto-${timestamp}-${random}`
  return `<${id}.${timestamp}@${DOMAIN}>`
}

function getPriorityHeaders(priority: string = 'normal') {
  switch (priority) {
    case 'high':
      return { 'X-Priority': '1', 'X-MSMail-Priority': 'High', 'Importance': 'High' }
    case 'low':
      return { 'X-Priority': '5', 'X-MSMail-Priority': 'Low', 'Importance': 'Low' }
    default:
      return { 'X-Priority': '3', 'X-MSMail-Priority': 'Normal', 'Importance': 'Normal' }
  }
}

function getAuthenticationHeaders(category: string = 'notification', validationScore: number = 0) {
  return {
    'Authentication-Results': `mx.google.com; spf=pass smtp.mailfrom=${DOMAIN}; dkim=pass header.i=@${DOMAIN}; dmarc=pass header.from=${DOMAIN}`,
    'X-Category': category,
    'X-Classification': category === 'transactional' ? 'transactional' : 'bulk',
    'X-Sender-Reputation': validationScore <= 2 ? 'high' : validationScore <= 5 ? 'medium' : 'low',
    'X-Spam-Score': validationScore.toString(),
    'X-MS-Exchange-Organization-SCL': validationScore <= 2 ? '0' : validationScore <= 5 ? '1' : '5',
    'X-MS-Exchange-Organization-PCL': '2',
    'X-Feedback-ID': `${category}:${DOMAIN}:platform`,
    'X-Campaign-ID': `nukhba-${category}`,
    'X-Content-Source': 'platform-generated',
    'X-Bulk-Type': 'notification',
    'Precedence': category === 'transactional' ? 'first-class' : 'bulk',
    'Auto-Submitted': category === 'transactional' ? 'no' : 'auto-generated'
  }
}

Deno.serve(async (req) => {
  console.log('=== send-enhanced-email function called ===')

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = Deno.env.get('Resend_Key') || Deno.env.get('RESEND_KEY') || Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error('No Resend API key found!')
    return new Response(JSON.stringify({ error: 'Resend API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: EnhancedEmailPayload
  try {
    payload = await req.json()
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!payload.to || !payload.subject || !payload.html) {
    return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const options = payload.options || {}
  const messageId = generateMessageId(options.emailId)
  const timestamp = new Date()
  const priorityHeaders = getPriorityHeaders(options.priority)
  const authHeaders = getAuthenticationHeaders(options.category, options.validationScore)

  const enhancedHeaders = {
    'Message-ID': messageId,
    'Date': timestamp.toUTCString(),
    'MIME-Version': '1.0',
    'From': FROM_EMAIL,
    'Reply-To': payload.replyTo || REPLY_TO_EMAIL,
    'Return-Path': `bounces@${DOMAIN}`,
    'Organization': ORGANIZATION,
    'X-Mailer': 'Nukhba-Platform/2.0',
    'Content-Type': 'multipart/alternative; charset=UTF-8',
    'Content-Transfer-Encoding': '8bit',
    'Content-Language': 'ar',
    'List-Unsubscribe': `<mailto:unsubscribe@${DOMAIN}?subject=Unsubscribe>, <https://${DOMAIN}/unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': `<notifications.${DOMAIN}>`,
    'List-Help': `<https://${DOMAIN}/help>`,
    ...priorityHeaders,
    ...authHeaders,
    'X-Entity-Ref-ID': `nukhba-platform-${timestamp.getTime()}`,
    'X-Platform': 'Nukhba',
    'X-Service': 'Email-Notifications',
    'X-Version': '2.0'
  }

  const requestBody = {
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || 'هذه رسالة من منصة تواصل النخبة. يرجى استخدام عميل بريد يدعم HTML لعرض المحتوى بشكل صحيح.',
    reply_to: payload.replyTo || REPLY_TO_EMAIL,
    cc: payload.cc,
    headers: enhancedHeaders,
    tags: [
      { name: 'category', value: options.category || 'notification' },
      { name: 'priority', value: options.priority || 'normal' },
      { name: 'platform', value: 'nukhba' },
      { name: 'version', value: '2.0' }
    ]
  }

  console.log('Sending enhanced email via Resend API:', {
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    cc: payload.cc
  })

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Nukhba-Platform/2.0 (Enhanced-Email-Service)'
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error('Resend API error:', { status: response.status, data })
      return new Response(JSON.stringify({
        ok: false,
        status: response.status,
        error: data,
        timestamp: timestamp.toISOString()
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      console.log('Enhanced email sent successfully:', { emailId: data.id, to: payload.to })
      return new Response(JSON.stringify({
        ok: true,
        status: response.status,
        data: { ...data, messageId, timestamp: timestamp.toISOString() }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    console.error('Network error calling Resend API:', error)
    return new Response(JSON.stringify({
      ok: false,
      status: 500,
      error: 'Network error: ' + (error instanceof Error ? error.message : 'Unknown error'),
      timestamp: timestamp.toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})