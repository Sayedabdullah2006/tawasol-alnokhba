import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireActiveAuthSession } from '@/lib/active-auth-session'

export const dynamic = 'force-dynamic'

// Browser JWT validation alone cannot detect a session revoked by another site.
// Use the same live-session guard as protected pages, without logging out from a
// background response that could arrive after a newer sign-in.
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' }
  const token = request.headers.get('authorization')?.match(/^Bearer (\S{1,16000})$/i)?.[1]
  if (!token) return NextResponse.json({ user: null }, { status: 401, headers })
  try {
    // Validate the browser's current token without reading, rotating or clearing
    // cookies. Even an SDK-driven cookie deletion could overwrite a newer login.
    const db = requireActiveAuthSession(createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } } },
    ))
    const { data: { user }, error } = await db.auth.getUser(token)
    if (error && ((error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) {
      return NextResponse.json({ error: 'SESSION_UNAVAILABLE' }, { status: 503, headers })
    }
    if (error || !user) return NextResponse.json({ user: null }, { status: 401, headers })

    const { data: profile, error: profileError } = await db.from('profiles')
      .select('full_name, role').eq('id', user.id).single()
    if (profileError) return NextResponse.json({ error: 'SESSION_UNAVAILABLE' }, { status: 503, headers })
    return NextResponse.json({ user: {
      id: user.id,
      fullName: profile?.full_name || user.email?.split('@')[0] || 'مستخدم',
      role: profile?.role || 'client',
    } }, { headers })
  } catch {
    return NextResponse.json({ error: 'SESSION_UNAVAILABLE' }, { status: 503, headers })
  }
}
