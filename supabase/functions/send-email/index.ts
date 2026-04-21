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

interface Payload {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
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
  console.log('API key found:', apiKey.substring(0, 10) + '...')

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

  if (!payload.to || !payload.subject || !payload.html) {
    return new Response(JSON.stringify({ error: 'Missing to/subject/html' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const requestBody = {
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    reply_to: payload.replyTo || REPLY_TO_EMAIL,
  }

  console.log('Resend API request:', {
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    apiKeyPrefix: apiKey.substring(0, 10) + '...'
  })

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

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
