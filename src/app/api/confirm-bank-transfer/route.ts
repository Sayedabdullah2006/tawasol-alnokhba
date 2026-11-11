import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { notifyBankTransferReceivedToAdmin, notifyBankTransferUnderReviewToClient } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

    const { requestId, receiptUrl } = await request.json()
    if(typeof requestId!=='string'||typeof receiptUrl!=='string'||!receiptUrl.trim())return NextResponse.json({error:'إيصال التحويل مطلوب'},{status:400})

    const { data: req } = await supabase
      .from('publish_requests')
      .select('user_id, status, request_number, client_name, client_email, final_total, admin_quoted_price')
      .eq('id', requestId)
      .single()

    if (!req) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (req.user_id !== user.id) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    if (req.status !== 'approved') {
      return NextResponse.json({ error: 'لا يمكن تأكيد الدفع الآن' }, { status: 400 })
    }

    const serviceClient = await createServiceRoleClient()
    const { error } = await serviceClient
      .from('publish_requests')
      .update({
        receipt_url: receiptUrl ?? null,
        status: 'payment_review',
        admin_notes: 'بانتظار تحقق الإدارة من إيصال التحويل البنكي',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'approved')
      .select('id')
      .single()

    if (error) {
      console.error('Confirm transfer error:', error)
      return NextResponse.json({ error: 'فشل تأكيد التحويل' }, { status: 500 })
    }

    // Notify admin about the bank transfer receipt
    const requestNumber = `ATH-${String(req.request_number).padStart(4, '0')}`
    const totalAmount = req.final_total ?? req.admin_quoted_price ?? 0
    await Promise.allSettled([notifyBankTransferReceivedToAdmin({
      requestNumber,
      clientName: req.client_name ?? 'العميل',
      totalAmount: Number(totalAmount)
    }), ...(req.client_email?[notifyBankTransferUnderReviewToClient({requestId,email:req.client_email,clientName:req.client_name??'العميل',requestNumber,receiptReference:receiptUrl})]:[])])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Bank transfer error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
