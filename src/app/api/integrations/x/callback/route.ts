import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { exchangeXAuthorizationCode, X_REDIRECT_URI } from '@/lib/x-oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const base = new URL(X_REDIRECT_URI).origin
  const destination = (query: string) => NextResponse.redirect(new URL(`/admin/integrations${query}`, base))
  const error = request.nextUrl.searchParams.get('error')
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', base))
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', base))
  if (error) return destination(`?x_error=${encodeURIComponent(error)}`)
  if (!code || state !== request.cookies.get('x_oauth_state')?.value) return destination('?x_error=state_mismatch')

  const verifier = request.cookies.get('x_oauth_verifier')?.value
  if (!verifier) return destination('?x_error=missing_pkce_verifier')
  try {
    await exchangeXAuthorizationCode(code, verifier)
  } catch {
    return destination('?x_error=token_exchange_failed')
  }

  const response = destination('?x_connected=1')
  response.cookies.set('x_oauth_state', '', { path: '/', maxAge: 0 })
  response.cookies.set('x_oauth_verifier', '', { path: '/', maxAge: 0 })
  return response
}
