// Explicit test accounts only. Does not send mail or touch existing users.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
const env = parse(await readFile('.env.local'))
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
await mkdir('.workforce-test', { recursive: true })
let state
try { state = JSON.parse(await readFile('.workforce-test/accounts.json', 'utf8')) } catch {
  state = { prefix: `wf-qa-${Date.now()}`, password: `Qa!${randomBytes(24).toString('base64url')}`, accounts: {} }
  await writeFile('.workforce-test/accounts.json', JSON.stringify(state, null, 2))
}
for (const role of ['admin', 'client']) {
  if (state.accounts[role]) continue
  const email = `${state.prefix}-${role}@example.com`
  const { data, error } = await service.auth.admin.createUser({ email, password: state.password, email_confirm: true, user_metadata: { full_name: `اختبار جودة الموظفين — ${role}` } })
  if (error) throw error
  const { error: profileError } = await service.from('profiles').update({ role }).eq('id', data.user.id)
  if (profileError) throw profileError
  state.accounts[role] = { email, id: data.user.id }
  await writeFile('.workforce-test/accounts.json', JSON.stringify(state, null, 2))
}
console.log('QA accounts available:', Object.keys(state.accounts).join(', '))
console.log('Credentials stored only in ignored .workforce-test/accounts.json. No email sent.')
