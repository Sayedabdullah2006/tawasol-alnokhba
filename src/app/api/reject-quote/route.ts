import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyQuoteRejectedByClient, notifyQuoteRejectionToClient } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const body = await request.json()
    const { requestId, rejectionReason } = body

    if (!requestId || !rejectionReason?.trim()) {
      return NextResponse.json({ error: 'بيانات غير كاملة' }, { status: 400 })
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
      return NextResponse.json({ error: 'لا يمكن رفض العرض في هذه المرحلة' }, { status: 400 })
    }

    // Update request status to client_rejected
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'client_rejected',
        client_rejection_reason: rejectionReason.trim(),
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل رفض العرض' }, { status: 500 })
    }

    // Send notifications
    const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`

    // Notify admin
    notifyQuoteRejectedByClient({
      requestNumber,
      clientName: existingRequest.client_name ?? 'العميل',
      rejectionReason: rejectionReason.trim(),
      quotedPrice: Number(existingRequest.admin_quoted_price ?? 0)
    }).catch(e => console.error('Admin rejection notification failed:', e))

    // Notify client (confirmation)
    if (existingRequest.client_email) {
      notifyQuoteRejectionToClient({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
      }).catch(e => console.error('Client rejection confirmation failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Reject quote error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}