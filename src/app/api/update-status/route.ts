import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  notifyPaymentConfirmedToClient,
  notifyInProgressToClient,
  notifyCompletedToClient,
  notifyRejectedToClient,
  notifyStatusUpdateToClient,
} from '@/lib/email'
import { REQUEST_STATUSES } from '@/lib/constants'

// ── حماية انتقالات الحالة ──────────────────────────────────────────
// يمنع الانتقال العشوائي بين الحالات ويحمي الحالات المالية النهائية
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:         ['quoted', 'rejected'],
  quoted:          ['approved', 'rejected', 'pending'],
  negotiation:     ['quoted', 'rejected', 'pending'],
  client_rejected: ['quoted', 'rejected', 'pending'],
  approved:        ['in_progress', 'paid', 'payment_review', 'rejected'],
  payment_review:  ['approved', 'paid', 'in_progress', 'rejected'],
  paid:            ['in_progress'],
  in_progress:     ['content_review', 'completed', 'info_requested', 'scheduled'],
  info_requested:  ['in_progress', 'content_review'],
  content_review:  ['in_progress', 'completed', 'changes_requested', 'scheduled'],
  changes_requested: ['in_progress', 'content_review', 'completed'],
  scheduled:       ['completed', 'in_progress'],
  completed:       [],          // حالة نهائية — لا تراجع
  rejected:        ['pending'], // يمكن إعادة فتح الطلب المرفوض
  auto_closed:     ['pending'],
}

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
    const { requestId, status: newStatus, adminNotes } = body

    if (!requestId || !newStatus) {
      return NextResponse.json({ error: 'البيانات غير مكتملة' }, { status: 400 })
    }

    // ── جلب الحالة الحالية قبل التحديث ──────────────────────────────
    const { data: current } = await supabase
      .from('publish_requests')
      .select('status, admin_notes')
      .eq('id', requestId)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    // ── التحقق من صحة الانتقال ────────────────────────────────────────
    const allowed = ALLOWED_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({
        error: `لا يمكن الانتقال من "${current.status}" إلى "${newStatus}"`,
        currentStatus: current.status,
        allowedTransitions: allowed,
      }, { status: 422 })
    }

    // ── تحديث قاعدة البيانات ──────────────────────────────────────────
    const now = new Date().toISOString()
    // لا نمسح ملاحظة الإدارة المخزنة عند تحديث الحالة ما لم يرسل الإجراء
    // قيمة ملاحظة صريحة. بهذا تبقى الملاحظة ظاهرة في بطاقة الطلب.
    const resolvedAdminNotes = typeof adminNotes === 'string'
      ? (adminNotes.trim() || null)
      : current.admin_notes

    const { data: updated, error } = await supabase
      .from('publish_requests')
      .update({
        status:             newStatus,
        admin_notes:        resolvedAdminNotes,
        last_status_change: now,
        updated_at:         now,
        // سجّل وقت تأكيد الدفع عند انتقال الطلب إلى "مدفوع" (تحويل بنكي)
        ...(newStatus === 'paid' || (current.status === 'payment_review' && newStatus === 'in_progress')
          ? { paid_at: now, payment_status: 'paid' }
          : {}),
      })
      .eq('id', requestId)
      .select('request_number, client_name, client_email, final_total, admin_quoted_price, estimated_reach, admin_notes')
      .single()

    if (error) {
      return NextResponse.json({ error: 'فشل تحديث الحالة' }, { status: 500 })
    }

    // ── إخطار العميل بتغيير الحالة ───────────────────────────────────
    // ملاحظة: حالة "quoted" لا تُرسل من هنا — send-quote يتولى ذلك
    if (updated?.client_email) {
      const requestNumber = `ATH-${String(updated.request_number).padStart(4, '0')}`
      const base = {
        email: updated.client_email,
        requestNumber,
        clientName: updated.client_name ?? 'عزيزنا',
      }
      let p: Promise<boolean> | null = null
      switch (newStatus) {
        case 'paid':
          p = notifyPaymentConfirmedToClient({
            ...base,
            total: Number(updated.final_total ?? updated.admin_quoted_price ?? 0),
          })
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
        case 'content_review':
        case 'payment_review':
        case 'approved':
        case 'pending':
          p = notifyStatusUpdateToClient({
            ...base,
            status:      newStatus,
            statusLabel: REQUEST_STATUSES[newStatus as keyof typeof REQUEST_STATUSES]?.label || newStatus,
            adminNotes: resolvedAdminNotes,
          })
          break
        // "quoted" مقصود عدم إرسال إيميل هنا — send-quote يتولاه
        default:
          if (REQUEST_STATUSES[newStatus as keyof typeof REQUEST_STATUSES]) {
            p = notifyStatusUpdateToClient({
              ...base,
              status:      newStatus,
              statusLabel: REQUEST_STATUSES[newStatus as keyof typeof REQUEST_STATUSES].label,
              adminNotes: resolvedAdminNotes,
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
