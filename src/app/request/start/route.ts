import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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
      return NextResponse.redirect(new URL(`/dashboard/membership/request?membership=${membership.id}`, request.url))
    }
  }

  return NextResponse.redirect(new URL('/request', request.url))
}
