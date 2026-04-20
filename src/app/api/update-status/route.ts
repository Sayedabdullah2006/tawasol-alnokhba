import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  notifyPaymentConfirmedToClient,
  notifyInProgressToClient,
  notifyCompletedToClient,
  notifyRejectedToClient,
} from '@/lib/email'

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
      }
      if (p) p.catch(e => console.error('Status email failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
