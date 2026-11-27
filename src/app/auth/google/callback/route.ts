import { NextRequest, NextResponse } from 'next/server'
import { publicAuthUrl } from '@/lib/auth-origin'
import { GOOGLE_AUTH_PATH, GOOGLE_RETURN_COOKIE, safePortalReturnPath } from '@/lib/portal-login'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = safePortalReturnPath(request.cookies.get(GOOGLE_RETURN_COOKIE)?.value ?? null)
  const code = params.get('code')
  const redirect = (path: string, failed = false) => {
    const url = process.env.NODE_ENV === 'production' ? publicAuthUrl(path) : new URL(path, request.nextUrl.origin)
    if (next) url.searchParams.set('next', next)
    if (failed) url.searchParams.set('google', 'failed')
    const response = NextResponse.redirect(url, {
      status: 303,
      headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
    })
    response.cookies.set(GOOGLE_RETURN_COOKIE, '', { path: GOOGLE_AUTH_PATH, maxAge: 0 })
    return response
  }

  if (!code || params.has('error')) return redirect('/auth/login', true)
  try {
    const supabase = await createServerSupabaseClient()
    const exchanged = await supabase.auth.exchangeCodeForSession(code)
    if (exchanged.error || !exchanged.data.user || !exchanged.data.session) return redirect('/auth/login', true)
    return redirect('/auth/complete-profile')
  } catch {
    return redirect('/auth/login', true)
  }
}
