import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyNegotiationRequestedByClient, notifyNegotiationRequestToClient } from '@/lib/email'
import { validateRequestId, validateNegotiationReason, validateProposedPrice, ValidationException, formatValidationErrors } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId, negotiationReason, proposedPrice } = body

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

    // Validate input data with context
    try {
      validateRequestId(requestId)
      validateNegotiationReason(negotiationReason)
      if (proposedPrice !== undefined && proposedPrice !== null) {
        validateProposedPrice(proposedPrice, Number(existingRequest.admin_quoted_price || 0))
      }
    } catch (error) {
      if (error instanceof ValidationException) {
        return NextResponse.json({ error: formatValidationErrors(error.errors) }, { status: 400 })
      }
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
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