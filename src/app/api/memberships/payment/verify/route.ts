import { NextRequest, NextResponse } from 'next/server'
import { verifyAndActivateMembership } from '@/lib/membership-payment'

export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get('id') || request.nextUrl.searchParams.get('paymentId')
  const membershipId = request.nextUrl.searchParams.get('membershipId') || undefined
  if (!paymentId) return NextResponse.json({ success: false, error: 'معرف الدفعة مطلوب' }, { status: 400 })
  const result = await verifyAndActivateMembership(paymentId, membershipId)
  return NextResponse.json({ ...result, error: result.success ? undefined : result.reason }, { status: result.success ? 200 : 400 })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (!body.paymentId) return NextResponse.json({ success: false, error: 'معرف الدفعة مطلوب' }, { status: 400 })
  const result = await verifyAndActivateMembership(body.paymentId, body.membershipId)
  return NextResponse.json({ ...result, error: result.success ? undefined : result.reason }, { status: result.success ? 200 : 400 })
}
