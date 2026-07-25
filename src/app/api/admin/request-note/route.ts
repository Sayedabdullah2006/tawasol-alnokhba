import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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

    const { requestId, adminNotes } = await request.json()
    if (!requestId || (adminNotes != null && typeof adminNotes !== 'string')) {
      return NextResponse.json({ error: 'بيانات الملاحظة غير صالحة' }, { status: 400 })
    }

    const note = adminNotes?.trim() || null
    const { data: updated, error } = await supabase
      .from('publish_requests')
      .update({ admin_notes: note, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select('admin_notes')
      .single()

    if (error || !updated) {
      console.error('Save admin note error:', error)
      return NextResponse.json({ error: 'تعذّر حفظ ملاحظة الإدارة' }, { status: 500 })
    }

    return NextResponse.json({ success: true, adminNotes: updated.admin_notes })
  } catch (error) {
    console.error('Save admin note exception:', error)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
