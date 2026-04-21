import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  notifyPaymentConfirmedToClient,
  notifyInProgressToClient,
  notifyCompletedToClient,
  notifyRejectedToClient,
  notifyQuoteReadyToClient,
  notifyStatusUpdateToClient,
} from '@/lib/email'
import { REQUEST_STATUSES } from '@/lib/constants'

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
    const { requestId, status, adminNotes } = body

    const { data: updated, error } = await supabase
      .from('publish_requests')
      .update({
        status,
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('request_number, client_name, client_email, final_total, admin_quoted_price')
      .single()

    if (error) {
      return NextResponse.json({ error: 'فشل تحديث الحالة' }, { status: 500 })
    }

    // Notify client of the status change — async, never blocks the response
    if (updated?.client_email) {
      const requestNumber = `ATH-${String(updated.request_number).padStart(4, '0')}`
      const base = {
        email: updated.client_email,
        requestNumber,
        clientName: updated.client_name ?? 'عزيزنا',
      }
      let p: Promise<boolean> | null = null
      switch (status) {
        case 'quoted':
          // When admin manually sets status to quoted (sends quote)
          p = notifyQuoteReadyToClient({
            ...base,
            price: Number(updated.admin_quoted_price ?? 0),
            reach: 0 // Will be calculated properly in the template
          })
          break
        case 'paid':
          p = notifyPaymentConfirmedToClient({ ...base, total: Number(updated.final_total ?? updated.admin_quoted_price ?? 0) })
          break
        case 'in_progress':
          p = notifyInProgressToClient(base)
          break
        case 'completed':
          p = notifyCompletedToClient(base)
          break
        case 'rejected':
          p = notifyRejectedToClient({ ...base, reason: adminNotes ?? '' })
          break
        case 'payment_review':
          // When admin manually changes status to payment review
          p = notifyStatusUpdateToClient({
            ...base,
            status,
            statusLabel: REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES]?.label || status,
            adminNotes
          })
          break
        case 'approved':
          // When admin manually approves (rare, usually done via approve-quote)
          p = notifyStatusUpdateToClient({
            ...base,
            status,
            statusLabel: REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES]?.label || status,
            adminNotes
          })
          break
        case 'pending':
          // When admin manually changes back to pending
          p = notifyStatusUpdateToClient({
            ...base,
            status,
            statusLabel: REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES]?.label || status,
            adminNotes
          })
          break
        default:
          // For any other status changes, send generic notification
          if (REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES]) {
            p = notifyStatusUpdateToClient({
              ...base,
              status,
              statusLabel: REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES].label,
              adminNotes
            })
          }
          break
      }
      if (p) p.catch(e => console.error('Status email failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
