import { NextRequest, NextResponse } from 'next/server'
import { publicAuthUrl } from '@/lib/auth-origin'
import { GOOGLE_AUTH_PATH, GOOGLE_FLOW_COOKIE, GOOGLE_RETURN_COOKIE, safePortalReturnPath } from '@/lib/portal-login'
import { validSsoOrigin } from '@/lib/sso'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!validSsoOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403, headers })

  try {
    const body = await request.json()
    const next = safePortalReturnPath(typeof body?.next === 'string' ? body.next : null)
    const callbackPath = '/auth/google/callback'
    const production = process.env.NODE_ENV === 'production'
    const callback = production ? publicAuthUrl(callbackPath) : new URL(callbackPath, request.nextUrl.origin)
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.href, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    })
    if (error || !data.url || !data.flowId) return NextResponse.json({ error: 'GOOGLE_START_FAILED' }, { status: 503, headers })

    const response = NextResponse.json({ url: data.url }, { headers })
    const cookieOptions = {
      path: GOOGLE_AUTH_PATH,
      httpOnly: true,
      secure: production,
      sameSite: 'lax' as const,
      maxAge: 900,
    }
    response.cookies.set(GOOGLE_FLOW_COOKIE, data.flowId, cookieOptions)
    response.cookies.set(GOOGLE_RETURN_COOKIE, next ?? '', { ...cookieOptions, maxAge: next ? 900 : 0 })
    return response
  } catch {
    return NextResponse.json({ error: 'GOOGLE_START_FAILED' }, { status: 503, headers })
  }
}
