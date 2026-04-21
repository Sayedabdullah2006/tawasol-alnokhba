import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyNegotiatedQuoteToClient } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const body = await request.json()
    const { requestId, newPrice, discountPercentage, adminNotes, acceptClientPrice } = body

    if (!requestId || (acceptClientPrice && typeof newPrice !== 'number') || (!acceptClientPrice && typeof newPrice !== 'number') || newPrice < 0) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    // Get request details for email
    const { data: existingRequest } = await supabase
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (existingRequest.status !== 'negotiation') {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة التفاوض' }, { status: 400 })
    }

    const originalPrice = Number(existingRequest.admin_quoted_price ?? 0)
    const clientProposedPrice = Number(existingRequest.client_proposed_price ?? 0)

    let finalPrice = newPrice
    let actualDiscountPercentage = 0
    let priceSource = 'admin_discount' // 'admin_discount' or 'client_accepted'

    if (acceptClientPrice && clientProposedPrice > 0) {
      // Admin accepted the client's proposed price
      finalPrice = clientProposedPrice
      priceSource = 'client_accepted'
      actualDiscountPercentage = originalPrice > 0
        ? Math.round(((originalPrice - clientProposedPrice) / originalPrice) * 100)
        : 0
    } else {
      // Admin set their own price (with discount percentage)
      actualDiscountPercentage = originalPrice > 0
        ? Math.round(((originalPrice - newPrice) / originalPrice) * 100)
        : 0
    }

    // Update request with negotiated price
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'quoted',
        admin_quoted_price: finalPrice,
        original_quoted_price: originalPrice, // Keep track of original price
        negotiated_discount_percentage: actualDiscountPercentage,
        negotiation_price_source: priceSource,
        admin_notes: adminNotes ?? null,
        negotiated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Reset user selections for new quote
        user_selected_extras: [],
        extras_selected_total: 0,
        final_total: finalPrice,
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل إرسال العرض المعدل' }, { status: 500 })
    }

    // Send notification email to client
    if (existingRequest.client_email) {
      const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
      notifyNegotiatedQuoteToClient({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
        originalPrice,
        newPrice: finalPrice,
        discountPercentage: actualDiscountPercentage,
        adminMessage: adminNotes ?? '',
        priceSource
      }).catch(e => console.error('Negotiated quote email failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send negotiated quote error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}