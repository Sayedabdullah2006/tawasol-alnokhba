import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const compile = async (path) => ts.transpileModule(await readFile(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const validationExports = {}
vm.runInNewContext(await compile('src/lib/validation.ts'), { exports: validationExports })
const routeCode = await compile('src/app/api/send-negotiated-quote/route.ts')

async function runCase({ proposed = 3500, original = 1999, accept = true, newPrice = proposed, dbError = null, role = 'admin', reject = false, customPrice, discountPercentage }) {
  const updates = []
  const emails = []
  const existingRequest = {
    status: 'negotiation', admin_quoted_price: original, client_proposed_price: proposed,
    request_number: 1, client_email: 'test@example.com', client_name: 'Test',
  }
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from(table) {
      const query = {
        select() { return query },
        update(values) { updates.push(values); return query },
        eq() { return query },
        single: async () => ({ data: table === 'profiles' ? { role } : existingRequest }),
        then(resolve, reject) {
          const discount = updates.at(-1)?.negotiated_discount_percentage
          const error = dbError ?? (discount < 0 || discount > 100 ? { code: '23514' } : null)
          return Promise.resolve({ error }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const exports = {}
  vm.runInNewContext(routeCode, {
    exports, console: { error() {} },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } }
      if (name === '@/lib/supabase-server') return { createServerSupabaseClient: async () => supabase }
      if (name === '@/lib/validation') return validationExports
      if (name === '@/lib/email') return {
        notifyNegotiatedQuoteToClient: async (data) => { emails.push(data) },
        notifyNegotiationRejectedToClient: async (data) => { emails.push(data) },
      }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  const response = await exports.POST(new Request('http://localhost/api/send-negotiated-quote', {
    method: 'POST', body: JSON.stringify({ requestId: 'test-request', newPrice, acceptClientPrice: accept, rejectNegotiation: reject, customPrice, discountPercentage }),
  }))
  return { response, updates, emails }
}

for (const [original, proposed, expectedDiscount] of [[1999, 3500, 0], [1999, 1999, 0], [2000, 1500, 25], [0, 3500, 0]]) {
  const { response, updates, emails } = await runCase({ original, proposed, newPrice: 1 })
  assert.equal(response.status, 200)
  assert.equal(updates[0].admin_quoted_price, proposed, 'Use the stored proposal, not the submitted price')
  assert.equal(updates[0].final_total, proposed)
  assert.equal(updates[0].negotiated_discount_percentage, expectedDiscount)
  assert.equal(updates[0].negotiation_price_source, 'client_accepted')
  assert.equal(updates[0].status, 'quoted')
  assert.deepEqual(Array.from(updates[0].user_selected_extras), [])
  assert.equal(updates[0].extras_selected_total, 0)
  assert.equal(emails[0].newPrice, proposed)
  assert.equal(emails[0].discountPercentage, expectedDiscount)
}
const discounted = await runCase({ original: 2000, newPrice: 1600, accept: false })
assert.equal(discounted.response.status, 200)
assert.equal(discounted.updates[0].negotiated_discount_percentage, 20)
assert.equal(discounted.updates[0].negotiation_price_source, 'admin_discount')
const failed = await runCase({ dbError: { code: '23514' } })
assert.equal(failed.response.status, 500)
assert.equal(failed.emails.length, 0)
const unauthorized = await runCase({ role: 'client' })
assert.equal(unauthorized.response.status, 403)
assert.equal(unauthorized.updates.length, 0)
const rejected = await runCase({ reject: true })
assert.equal(rejected.response.status, 200)
assert.equal(rejected.updates[0].negotiation_rejected, true)
assert.equal(rejected.updates[0].admin_quoted_price, undefined)
for (const price of [0, 1500.50, 1999, 3500, 1000000]) {
  const direct = await runCase({ newPrice: price, accept: false, customPrice: true })
  assert.equal(direct.response.status, 200)
  assert.equal(direct.updates[0].admin_quoted_price, price)
  assert.equal(direct.updates[0].final_total, price)
  assert.equal(direct.updates[0].negotiated_discount_percentage, 0)
  assert.equal(direct.updates[0].negotiation_price_source, null)
  assert.equal(direct.emails[0].priceSource, 'admin_price')
}
for (const options of [
  { newPrice: -1 }, { newPrice: 1000001 }, { newPrice: '' }, { newPrice: 'invalid' },
  { accept: true }, { reject: true }, { discountPercentage: 10 }, { customPrice: 'true' },
]) {
  const invalid = await runCase({ accept: false, customPrice: true, ...options })
  assert.equal(invalid.response.status, 400)
  assert.equal(invalid.updates.length, 0)
  assert.equal(invalid.emails.length, 0)
}
const templateExports = {}
vm.runInNewContext(await compile('src/lib/email-templates.ts'), { exports: templateExports })
const email = templateExports.negotiatedQuoteToClient({
  email: 'test@example.com', requestNumber: 'ATH-0001', clientName: 'Test',
  originalPrice: 1999, newPrice: 1500.50, discountPercentage: 25,
  adminMessage: '', priceSource: 'admin_price',
})
assert.match(email.subject, /عرض معدل بسعر جديد/)
assert.match(email.html, /1500.5 ر.س/)
assert.doesNotMatch(email.html, /خصم خاص|وفرت|25%/)
console.log('Passed: negotiation actions, direct prices, invalid/conflicting inputs, authorization, database failure, custom-price email')
