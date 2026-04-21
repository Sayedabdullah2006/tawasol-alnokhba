import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyNegotiationRequestedByClient, notifyNegotiationRequestToClient } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId, negotiationReason, proposedPrice } = body

    if (!requestId || !negotiationReason?.trim()) {
      return NextResponse.json({ error: 'بيانات غير كاملة' }, { status: 400 })
    }

    // Validate proposed price if provided
    if (proposedPrice !== undefined && (typeof proposedPrice !== 'number' || proposedPrice < 0)) {
      return NextResponse.json({ error: 'السعر المقترح غير صالح' }, { status: 400 })
    }

    // Get request details
    const { data: existingRequest } = await supabase
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    // Verify the user owns this request
    if (existingRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    if (existingRequest.status !== 'quoted') {
      return NextResponse.json({ error: 'لا يمكن طلب التفاوض في هذه المرحلة' }, { status: 400 })
    }

    // Update request status to negotiation
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'negotiation',
        negotiation_reason: negotiationReason.trim(),
        client_proposed_price: proposedPrice ?? null,
        negotiation_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل طلب التفاوض' }, { status: 500 })
    }

    // Send notifications
    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`

    // Notify admin
    notifyNegotiationRequestedByClient({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
      negotiationReason: negotiationReason.trim(),
      originalPrice: Number(existingRequest.admin_quoted_price ?? 0),
      proposedPrice: proposedPrice ?? null
    }).catch(e => console.error('Admin negotiation notification failed:', e))

    // Notify client (confirmation)
    if (existingRequest.client_email) {
      notifyNegotiationRequestToClient({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
      }).catch(e => console.error('Client negotiation confirmation failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Request negotiation error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}