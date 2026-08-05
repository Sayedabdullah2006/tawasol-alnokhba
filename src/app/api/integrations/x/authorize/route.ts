import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildXAuthorizeUrl, createPkceVerifier, xConfigured } from '@/lib/x-oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!xConfigured()) return NextResponse.json({ error: 'X integration environment variables are incomplete' }, { status: 500 })

  const state = crypto.randomUUID()
  const verifier = createPkceVerifier()
  const response = NextResponse.redirect(buildXAuthorizeUrl(state, verifier))
  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 600 }
  response.cookies.set('x_oauth_state', state, cookieOptions)
  response.cookies.set('x_oauth_verifier', verifier, cookieOptions)
  return response
}
