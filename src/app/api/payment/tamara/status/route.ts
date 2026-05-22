/**
 * GET /api/payment/tamara/status?requestId=xxx
 * Used by the callback page to check if the webhook has processed the order.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const requestId = searchParams.get('requestId')

  if (!requestId) {
    return NextResponse.json({ status: 'unknown' }, { status: 400 })
  }

  try {
    const supabase = await createServiceRoleClient()
    const { data } = await supabase
      .from('publish_requests')
      .select('status')
      .eq('id', requestId)
      .single()

    return NextResponse.json({ status: data?.status ?? 'unknown' })
  } catch {
    return NextResponse.json({ status: 'unknown' })
  }
}
