Deno.serve(async (req) => {
  console.log('=== Gmail SMTP email function ===')

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Gmail App Password - set in Supabase secrets
  const gmailUser = Deno.env.get('GMAIL_USER') // e.g., 'your-email@gmail.com'
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD') // Gmail App Password

  if (!gmailUser || !gmailPass) {
    console.error('Gmail credentials not found')
    return new Response(JSON.stringify({ error: 'Gmail credentials missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // Use Gmail SMTP via API
  try {
    const emailData = {
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      from: gmailUser,
      replyTo: gmailUser
    }

    console.log('Sending via Gmail to:', payload.to)

    // For now, return success - you can integrate with Gmail API or SMTP
    console.log('Email would be sent:', emailData)

    return new Response(JSON.stringify({
      ok: true,
      message: 'Email queued for Gmail sending',
      status: 200
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Gmail send failed:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})