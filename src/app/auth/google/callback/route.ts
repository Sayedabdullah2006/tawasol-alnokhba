import { NextRequest, NextResponse } from 'next/server'
import { publicAuthUrl } from '@/lib/auth-origin'
import { GOOGLE_AUTH_PATH, GOOGLE_FLOW_COOKIE, GOOGLE_RETURN_COOKIE, safePortalReturnPath } from '@/lib/portal-login'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = safePortalReturnPath(request.cookies.get(GOOGLE_RETURN_COOKIE)?.value ?? null)
  const code = params.get('code')
  const flowId = request.cookies.get(GOOGLE_FLOW_COOKIE)?.value
  const redirect = (path: string, failed = false) => {
    const url = process.env.NODE_ENV === 'production' ? publicAuthUrl(path) : new URL(path, request.nextUrl.origin)
    if (next) url.searchParams.set('next', next)
    if (failed) url.searchParams.set('google', 'failed')
    const response = NextResponse.redirect(url, {
      status: 303,
      headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
    })
    for (const cookie of [GOOGLE_RETURN_COOKIE, GOOGLE_FLOW_COOKIE]) {
      response.cookies.set(cookie, '', { path: GOOGLE_AUTH_PATH, maxAge: 0 })
    }
    return response
  }

  if (!code || params.has('error')) {
    if (params.get('error') !== 'access_denied') console.warn('GOOGLE_OAUTH_NO_CODE')
    return redirect('/auth/login', true)
  }
  try {
    const supabase = await createServerSupabaseClient()
    const exchanged = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    if (exchanged.error || !exchanged.data.user || !exchanged.data.session) {
      console.warn('GOOGLE_OAUTH_EXCHANGE_FAILED', exchanged.error?.code ?? exchanged.error?.name ?? 'missing_session')
      return redirect('/auth/login', true)
    }
    return redirect('/auth/complete-profile')
  } catch {
    console.warn('GOOGLE_OAUTH_CALLBACK_FAILED')
    return redirect('/auth/login', true)
  }
}
