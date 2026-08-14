import { NextResponse } from 'next/server'
import { ensureServiceInvoice } from '@/lib/service-invoice'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: 'معرف الطلب غير صحيح' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

  const [{ data: requestRow }, { data: profile }] = await Promise.all([
    supabase.from('publish_requests').select('id, user_id').eq('id', requestId).maybeSingle(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])
  if (!requestRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
  if (requestRow.user_id !== user.id && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'غير مصرح بتحميل هذه الفاتورة' }, { status: 403 })
  }

  try {
    const invoice = await ensureServiceInvoice(requestId)
    return new NextResponse(new Uint8Array(invoice.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[INVOICE] Download failed:', error)
    const message = error instanceof Error && error.message === 'invoice_request_not_paid'
      ? 'لا تتوفر فاتورة لهذا الطلب قبل تأكيد الدفع'
      : 'تعذر تجهيز الفاتورة حالياً'
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
