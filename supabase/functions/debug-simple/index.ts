Deno.serve(async (req) => {
  console.log('DEBUG: Function started')

  return new Response(JSON.stringify({
    message: 'Function is working',
    method: req.method,
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
})