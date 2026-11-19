import fs from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { NextResponse } from 'next/server.js'

function handler({ user = null, error = null, profile = null, profileError = null, throws = false } = {}, authorization = 'Bearer fixture-token') {
  const source = fs.readFileSync('src/app/api/auth/session/route.ts', 'utf8')
  const exports = {}
  const db = {
    auth: { getUser: async token => {
      assert.equal(token, 'fixture-token')
      return { data: { user }, error }
    } },
    from(table) {
      assert.equal(table, 'profiles')
      return { select(columns) {
        assert.equal(columns, 'full_name, role')
        return { eq(column, id) {
          assert.equal(column, 'id'); assert.equal(id, user.id)
          return { single: async () => ({ data: profile, error: profileError }) }
        } }
      } }
    },
  }
  const require = name => {
    if (name === 'next/server') return { NextResponse }
    if (name === '@/lib/active-auth-session') return { requireActiveAuthSession: client => client }
    if (name === '@supabase/supabase-js') return { createClient: (_url, _key, options) => {
      assert.equal(options.auth.persistSession, false)
      assert.equal(options.auth.autoRefreshToken, false)
      assert.equal(options.global.headers.Authorization, 'Bearer fixture-token')
      if (throws) throw Error('private provider error')
      return db
    } }
    throw Error('Unexpected import: ' + name)
  }
  new Function('require', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(require, exports)
  return () => exports.GET(new Request('https://nukhba.media/api/auth/session', {
    headers: authorization ? { Authorization: authorization } : {},
  }))
}

test('anonymous or globally revoked session returns no navigation identity', async () => {
  for (const authorization of [null, 'Basic fixture', 'Bearer two tokens']) {
    const response = await handler({}, authorization)()
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { user: null })
  }
  for (const error of [null, { status: 401, code: 'session_not_found' }]) {
    const response = await handler({ error })()
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { user: null })
    assert.match(response.headers.get('cache-control'), /private, no-store/)
    assert.equal(response.headers.get('set-cookie'), null)
  }
})

test('navigation receives only the verified user and own profile', async () => {
  const response = await handler({
    user: { id: 'verified-user', email: 'private@example.invalid', access_token: 'must-not-leak' },
    profile: { full_name: 'اسم المستخدم', role: 'client' },
  })()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { user: { id: 'verified-user', fullName: 'اسم المستخدم', role: 'client' } })
})

test('provider, session-check and profile outages are not reported as logout', async () => {
  for (const input of [
    { error: { status: 503 } },
    { error: { status: 0, name: 'AuthRetryableFetchError' } },
    { user: { id: 'verified-user' }, profileError: { message: 'private database error' } },
    { throws: true },
  ]) {
    const response = await handler(input)()
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'SESSION_UNAVAILABLE' })
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.equal(response.headers.get('set-cookie'), null)
  }
})
