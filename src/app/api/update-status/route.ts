import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify admin
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

    const { error } = await supabase
      .from('publish_requests')
      .update({
        status,
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      return NextResponse.json({ error: 'فشل تحديث الحالة' }, { status: 500 })
    }

    // TODO: Send status update email via Resend

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
