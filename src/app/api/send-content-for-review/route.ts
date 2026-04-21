import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyContentReadyForReview } from '@/lib/email'

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
    const { requestId, proposedContent, proposedImages } = body

    if (!requestId || !proposedContent?.trim()) {
      return NextResponse.json({ error: 'بيانات غير كاملة' }, { status: 400 })
    }

    // Get request details for email
    const { data: existingRequest } = await supabase
      .from('publish_requests')
      .select('request_number, client_name, client_email, status')
      .eq('id', requestId)
      .single()

    if (!existingRequest) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (existingRequest.status !== 'in_progress') {
      return NextResponse.json({ error: 'الطلب ليس في مرحلة التنفيذ' }, { status: 400 })
    }

    // Update request with proposed content
    const { error } = await supabase
      .from('publish_requests')
      .update({
        status: 'content_review',
        proposed_content: proposedContent.trim(),
        proposed_images: proposedImages || [],
        content_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
    }

    // Send notification email to client
    if (existingRequest.client_email) {
      const requestNumber = `ATH-${String(existingRequest.request_number).padStart(4, '0')}`
      notifyContentReadyForReview({
        email: existingRequest.client_email,
        requestNumber,
        clientName: existingRequest.client_name ?? 'عزيزنا العميل',
        proposedContent,
        proposedImages: proposedImages || [],
      }).catch(e => console.error('Email notification failed:', e))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send content error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}