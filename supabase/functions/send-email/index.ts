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

const FROM_EMAIL = 'Nukhba <noreply@nukhba.media>'

interface Payload {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = Deno.env.get('Resend_Key') || Deno.env.get('RESEND_KEY') || Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Resend_Key secret not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
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
    reply_to: payload.replyTo,
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
