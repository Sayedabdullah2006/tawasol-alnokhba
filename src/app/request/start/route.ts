import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const PRODUCTION_ORIGIN = 'https://nukhba.media'

function redirectOrigin(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') return request.nextUrl.origin

  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.APP_BASE_URL]) {
    if (!value) continue
    try {
      const configured = new URL(value)
      const isLocal = configured.hostname === 'localhost' || configured.hostname === '127.0.0.1'
      if (configured.protocol === 'https:' && !isLocal) return configured.origin
    } catch {
      // Ignore malformed deployment values and use the canonical production origin.
    }
  }

  return PRODUCTION_ORIGIN
}

export async function GET(request: NextRequest) {
  const origin = redirectOrigin(request)
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()

  if (user) {
    const service = await createServiceRoleClient()
    const now = new Date().toISOString()
    const { data: membership } = await service
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('ends_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (membership) {
      return NextResponse.redirect(new URL(`/dashboard/membership/request?membership=${membership.id}`, origin))
    }
  }

  return NextResponse.redirect(new URL('/request', origin))
}
