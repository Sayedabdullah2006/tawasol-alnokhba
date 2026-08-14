import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
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
  pending:         ['quoted', 'in_progress', 'rejected', 'suspended'],
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

type UpdatedRequest = {
  id: string
  request_number: number
  client_name: string | null
  client_email: string
  final_total: number | null
  admin_quoted_price: number | null
  estimated_reach: number | null
  admin_notes: string | null
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
      .select('status, admin_notes, suspended_from_status, billing_source, membership_credit_status')
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
    const membershipStart = current.billing_source === 'membership' && current.status === 'pending' && targetStatus === 'in_progress'
    const membershipReject = current.billing_source === 'membership' && current.status === 'pending' && targetStatus === 'rejected'
    const membershipCreditReserved = current.billing_source === 'membership' && current.membership_credit_status === 'reserved'
    if (membershipCreditReserved && !['pending', 'in_progress', 'rejected', 'suspended'].includes(targetStatus)) {
      return NextResponse.json({
        error: 'طلب العضوية ما زال تحت المراجعة؛ يجب قبوله وبدء التنفيذ أو رفضه وإعادة الرصيد أولاً',
      }, { status: 422 })
    }
    if (current.billing_source === 'membership' && current.status === 'rejected' && targetStatus === 'pending') {
      return NextResponse.json({
        error: 'لا يمكن إعادة فتح طلب عضوية أُعيد رصيده؛ يقدّم العميل طلباً جديداً من رصيده المتاح',
      }, { status: 422 })
    }
    if ((isResume && current.status !== 'suspended') || (!isResume && !isDirectSchedule && !allowed.includes(targetStatus))) {
      return NextResponse.json({
        error: `لا يمكن الانتقال من "${current.status}" إلى "${targetStatus}"`,
        currentStatus: current.status,
        allowedTransitions: allowed,
      }, { status: 422 })
    }
    if (current.status === 'pending' && targetStatus === 'in_progress' && !membershipStart) {
      return NextResponse.json({ error: 'الانتقال المباشر إلى التنفيذ متاح لطلبات العضوية فقط' }, { status: 422 })
    }

    // ── تحديث قاعدة البيانات ──────────────────────────────────────────
    const now = new Date().toISOString()
    // لا نمسح ملاحظة الإدارة المخزنة عند تحديث الحالة ما لم يرسل الإجراء
    // قيمة ملاحظة صريحة. بهذا تبقى الملاحظة ظاهرة في بطاقة الطلب.
    const resolvedAdminNotes = typeof adminNotes === 'string'
      ? (adminNotes.trim() || null)
      : current.admin_notes

    let updated: UpdatedRequest | null = null
    if (membershipStart || membershipReject) {
      const service = await createServiceRoleClient()
      const rpcName = membershipStart ? 'start_membership_request' : 'reject_membership_request'
      const { error: resourceError } = await service.rpc(rpcName, {
        p_request_id: requestId,
        p_admin_notes: resolvedAdminNotes,
      })
      if (resourceError) {
        console.error(`[MEMBERSHIP] ${rpcName} failed:`, resourceError)
        return NextResponse.json({
          error: membershipStart
            ? 'تعذر استهلاك رصيد العضوية وبدء الطلب'
            : 'تعذر إعادة رصيد العضوية ورفض الطلب',
        }, { status: 409 })
      }
      const { data, error } = await service
        .from('publish_requests')
        .select('id, request_number, client_name, client_email, final_total, admin_quoted_price, estimated_reach, admin_notes')
        .eq('id', requestId)
        .single()
      if (error) return NextResponse.json({ error: 'تم تحديث الطلب وتعذر تحميل بياناته' }, { status: 500 })
      updated = data
    } else {
      const { data, error } = await supabase
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
      if (error) return NextResponse.json({ error: 'فشل تحديث الحالة' }, { status: 500 })
      updated = data
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
            requestId,
            total: Number(updated.final_total ?? updated.admin_quoted_price ?? 0),
            payment: { provider: 'دفع معتمد من الإدارة', paidAt: now },
          })
          break
        case 'in_progress':
          p = current.status === 'payment_review'
            ? notifyPaymentConfirmedToClient({
                ...base,
                requestId,
                total: Number(updated.final_total ?? updated.admin_quoted_price ?? 0),
                payment: { provider: 'تحويل بنكي', method: 'تحويل بنكي معتمد', paidAt: now },
              })
            : notifyInProgressToClient(base)
          break
        case 'completed':
          p = notifyCompletedToClient(base)
          break
        case 'rejected':
          p = notifyRejectedToClient({
            ...base,
            reason: membershipReject
              ? `${adminNotes?.trim() ? `${adminNotes.trim()}\n\n` : ''}تمت إعادة رصيد المنشور وأي مزايا محجوزة إلى عضويتك تلقائياً.`
              : adminNotes ?? '',
          })
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

    if (membershipStart) {
      import('@/lib/auto-studio')
        .then(module => module.autoRunRequestStudio(requestId))
        .catch(error => console.error('[MEMBERSHIP] Auto studio failed after approval:', error))
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}
