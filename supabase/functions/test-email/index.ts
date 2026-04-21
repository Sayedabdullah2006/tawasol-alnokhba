Deno.serve(async (req) => {
  console.log('=== TEST EMAIL FUNCTION ===')

  const apiKey = Deno.env.get('Resend_Key') || Deno.env.get('RESEND_KEY') || Deno.env.get('RESEND_API_KEY')

  if (!apiKey) {
    console.log('No API key found')
    return new Response('No API key', { status: 500 })
  }

  console.log('API key found:', apiKey.substring(0, 15) + '...')

  // Test call to Resend
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'test@nukhba.media',
        to: 'test@example.com',
        subject: 'Test',
        html: 'Test message'
      })
    })

    const result = await response.json()
    console.log('Resend response status:', response.status)
    console.log('Resend response:', result)

    return new Response(JSON.stringify({
      status: response.status,
      result,
      apiKeyPrefix: apiKey.substring(0, 15) + '...'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Test failed:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})