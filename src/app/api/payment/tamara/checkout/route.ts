/**
 * POST /api/payment/tamara/checkout
 * Creates a Tamara checkout session and returns the checkout_url.
 * Called from the payment page when the user picks Tamara.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createTamaraCheckoutSession } from '@/lib/tamara-server'

export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json()

    if (!requestId) {
      return NextResponse.json({ success: false, error: 'معرف الطلب مطلوب' }, { status: 400 })
    }

    // Verify the requesting user owns this order
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 })
    }

    const { data: order } = await supabase
      .from('publish_requests')
      .select('id, user_id, status')
      .eq('id', requestId)
      .single()

    if (!order || order.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (order.status !== 'approved') {
      return NextResponse.json({ success: false, error: 'الطلب غير جاهز للدفع' }, { status: 400 })
    }

    const result = await createTamaraCheckoutSession(requestId)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success:     true,
      checkoutUrl: result.checkoutUrl,
      orderId:     result.orderId,
    })
  } catch (error) {
    console.error('[TAMARA_CHECKOUT] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}
