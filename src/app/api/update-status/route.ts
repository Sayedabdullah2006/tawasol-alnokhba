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
import { sendRequestReviewInvitation } from '@/lib/request-reviews'
import { generateRequestNumber } from '@/lib/utils'

// ── حماية انتقالات الحالة ──────────────────────────────────────────
// يمنع الانتقال العشوائي بين الحالات ويحمي الحالات المالية النهائية
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:         ['quoted', 'rejected', 'suspended'],
  quoted:          ['approved', 'rejected', 'pending', 'suspended'],
  negotiation:     ['quoted', 'rejected', 'pending', 'suspended'],
  client_rejected: ['quoted', 'rejected', 'pending', 'suspended'],
  approved:        ['in_progress', 'paid', 'payment_review', 'rejected', 'suspended'],
  payment_review:  ['approved', 'paid', 'in_progress', 'rejected', 'suspended'],
  paid:            ['in_progress', 'suspended'],
  in_progress:     ['content_review', 'completed', 'info_requested', 'scheduled', 'suspended'],
  info_requested:  ['in_progress', 'content_review', 'suspended'],
  content_review:  ['in_progress', 'completed', 'changes_requested', 'scheduled', 'suspended'],
  changes_requested: ['in_progress', 'content_review', 'completed', 'suspended'],
  scheduled:       ['completed', 'in_progress', 'suspended'],
  suspended:       [],
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
      .select('status, admin_notes, suspended_from_status')
      .eq('id', requestId)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    // ── التحقق من صحة الانتقال ────────────────────────────────────────
    const isResume = newStatus === 'resume'
    const targetStatus = isResume ? (current.suspended_from_status ?? 'in_progress') : newStatus
    const allowed = ALLOWED_TRANSITIONS[current.status] ?? []
    // The admin may schedule a request from any workflow state. This is useful when
    // the publishing decision supersedes an outstanding review or revision state.
    const isDirectSchedule = targetStatus === 'scheduled'
    if ((isResume && current.status !== 'suspended') || (!isResume && !isDirectSchedule && !allowed.includes(targetStatus))) {
      return NextResponse.json({
        error: `لا يمكن الانتقال من "${current.status}" إلى "${targetStatus}"`,
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
        status:             targetStatus,
        admin_notes:        resolvedAdminNotes,
        suspended_from_status: targetStatus === 'suspended'
          ? current.status
          : (isResume || isDirectSchedule ? null : current.suspended_from_status),
        last_status_change: now,
        updated_at:         now,
        // سجّل وقت تأكيد الدفع عند انتقال الطلب إلى "مدفوع" (تحويل بنكي)
        ...(targetStatus === 'paid' || (current.status === 'payment_review' && targetStatus === 'in_progress')
          ? { paid_at: now, payment_status: 'paid' }
          : {}),
      })
      .eq('id', requestId)
      .select('id, request_number, client_name, client_email, final_total, admin_quoted_price, estimated_reach, admin_notes')
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
      if (!isResume && targetStatus !== 'suspended') switch (targetStatus) {
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
            status:      targetStatus,
            statusLabel: REQUEST_STATUSES[targetStatus as keyof typeof REQUEST_STATUSES]?.label || targetStatus,
            adminNotes: resolvedAdminNotes,
          })
          break
        // "quoted" مقصود عدم إرسال إيميل هنا — send-quote يتولاه
        default:
          if (REQUEST_STATUSES[targetStatus as keyof typeof REQUEST_STATUSES]) {
            p = notifyStatusUpdateToClient({
              ...base,
              status:      targetStatus,
              statusLabel: REQUEST_STATUSES[targetStatus as keyof typeof REQUEST_STATUSES].label,
              adminNotes: resolvedAdminNotes,
            })
          }
          break
      }
      if (p) p.catch(e => console.error('Status email failed:', e))

      if (targetStatus === 'completed') {
        sendRequestReviewInvitation({
          requestId: updated.id,
          requestNumber: generateRequestNumber(updated.request_number),
          clientName: updated.client_name ?? 'عميلنا العزيز',
          clientEmail: updated.client_email,
        }).catch(error => console.error('Request review invitation failed:', error))
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
