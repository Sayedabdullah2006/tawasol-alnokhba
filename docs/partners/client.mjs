/** Node/server use only. Never import into a browser bundle. Secrets belong to the calling server. */
import { createHash, createHmac, randomUUID } from 'node:crypto'

export function createNukhbaClient({ origin, partnerId, keyId, secret }) {
  const root = new URL(origin)
  if (root.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(root.hostname)) throw new Error('HTTPS required')
  return async function call(path, { customerId, body, idempotencyKey = body ? randomUUID() : '', responseType = 'json' } = {}) {
    if (!/^[a-zA-Z0-9_.:@-]{1,128}$/.test(customerId ?? '')) throw new Error('A server-authenticated customer id is required')
    if (!/^(catalog|quotes|orders|identity)(\/|\?|$)/.test(path)) throw new Error('Invalid API path')
    const invoicePath = /^orders\/[a-f0-9-]{36}\/invoice$/i.test(path)
    if (!['json', 'pdf'].includes(responseType) || (responseType === 'pdf' && (!invoicePath || body !== undefined))) throw new Error('Invalid response type')
    if (invoicePath && responseType !== 'pdf') throw new Error('Use responseType: pdf for invoices')
    const method = body === undefined ? 'GET' : 'POST'
    const raw = body === undefined ? '' : JSON.stringify(body)
    const target = `/api/partners/v1/${path}`
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomUUID()
    const canonical = [method, target, timestamp, nonce, customerId, method === 'POST' ? idempotencyKey : '', createHash('sha256').update(raw).digest('hex')].join('\n')
    const response = await fetch(new URL(target, root.origin), {
      method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'X-Partner-ID': partnerId, 'X-Key-ID': keyId,
        'X-Customer-ID': customerId, 'X-Timestamp': timestamp, 'X-Nonce': nonce,
        'X-Signature': createHmac('sha256', secret).update(canonical).digest('hex'),
        ...(method === 'POST' ? { 'Idempotency-Key': idempotencyKey } : {}),
      }, ...(method === 'POST' ? { body: raw } : {}),
    })
    if (!response.ok) {
      const result = await response.json()
      const error = new Error(result.error?.code ?? 'NUKHBA_UNAVAILABLE')
      error.status = response.status; error.traceId = result.trace_id
      throw error
    }
    if (responseType === 'pdf') {
      if (response.headers.get('content-type')?.split(';')[0] !== 'application/pdf') throw new Error('INVALID_INVOICE_RESPONSE')
      const name = response.headers.get('content-disposition')?.match(/filename="([a-zA-Z0-9_-]+\.pdf)"/)?.[1] ?? 'invoice.pdf'
      return { bytes: new Uint8Array(await response.arrayBuffer()), filename: name, contentType: 'application/pdf' }
    }
    const result = await response.json()
    return result.data
  }
}
