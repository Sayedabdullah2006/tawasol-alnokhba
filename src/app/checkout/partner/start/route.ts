import { NextResponse } from 'next/server'
import { checkoutOrigin, checkoutSession } from '@/lib/partners/checkout'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== checkoutOrigin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { token } = await request.json()
    if (typeof token !== 'string' || token.length > 160) throw new Error('invalid token')
    const session = await checkoutSession(token)
    const response = NextResponse.json({ session_id: session.id })
    response.cookies.set(`partner_checkout_${session.id}`, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400 })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch {
    return new Response('رابط الدفع غير صالح أو منتهي. ارجع إلى أول سعودي لإنشاء جلسة دفع جديدة.', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  }
}
