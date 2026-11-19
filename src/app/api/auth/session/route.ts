import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Browser JWT validation alone cannot detect a session revoked by another site.
// Use the same live-session guard as protected pages, without logging out from a
// background response that could arrive after a newer sign-in.
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' }
  try {
    const db = await createServerSupabaseClient()
    const { data: { user }, error } = await db.auth.getUser()
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
