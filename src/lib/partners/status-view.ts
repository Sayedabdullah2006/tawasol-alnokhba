import { createHash } from 'node:crypto'
import { CLIENT_STATUS_LABELS } from '@/lib/status-labels'
import { PROGRESS_STEPS } from '@/lib/constants'

type Label = { label: string; description: string; color: string }
/** Presentation definitions only: never writes or translates stored state codes. */
export const PAYMENT_LABELS: Record<string, Label> = {
  pending: { label: 'بانتظار تأكيد الدفع', description: 'لم يؤكد النظام سداد الطلب بعد', color: 'orange' },
  unpaid: { label: 'غير مدفوع', description: 'لم يسدد مبلغ الطلب', color: 'gray' },
  paid: { label: 'تم تأكيد الدفع', description: 'أكد النظام استلام الدفع', color: 'green' },
  failed: { label: 'لم تكتمل عملية الدفع', description: 'حالة الدفع المسجلة غير ناجحة', color: 'red' },
  refund_pending: { label: 'استرجاع قيد المعالجة', description: 'يجري استرجاع المبلغ إلى وسيلة الدفع', color: 'orange' },
  partially_refunded: { label: 'تم استرجاع جزء من المبلغ', description: 'تم تنفيذ استرجاع جزئي؛ لا يعني ذلك إلغاء الطلب أو اكتمال تنفيذه', color: 'gray' },
  refunded: { label: 'تم الاسترجاع', description: 'تم استرجاع مبلغ الطلب', color: 'gray' },
}
const CHECKOUT_LABELS: Record<string, Label> = {
  pending: { label: 'جلسة دفع بانتظار التأكيد', description: 'وجود جلسة دفع ليس تأكيدًا للسداد', color: 'orange' },
  paid: PAYMENT_LABELS.paid,
  review_required: { label: 'عملية تحتاج مراجعة مالية', description: 'لا تكرر الدفع؛ تتولى الإدارة مراجعة العملية', color: 'orange' },
}
const terminal = new Set(['completed', 'rejected', 'client_rejected', 'auto_closed', 'cancelled', 'refunded'])
export function stateLabel(code: unknown, definitions: Record<string, Label>) {
  const key = typeof code === 'string' ? code : null
  const known = key !== null && Object.hasOwn(definitions, key)
  return { code: key, known, ...(known ? definitions[key!] : { label: 'حالة غير معروفة', description: 'حدّث بيانات الطلب أو تواصل مع الدعم', color: 'gray' }) }
}
export function partnerStatusDefinitions() {
  const definitions = { request: CLIENT_STATUS_LABELS, payment: PAYMENT_LABELS, checkout: CHECKOUT_LABELS, progress_steps: PROGRESS_STEPS }
  return { version: createHash('sha256').update(JSON.stringify(definitions)).digest('hex'), ...definitions }
}
export interface CheckoutState { status: string; expires_at: string; created_at: string; paid_at: string | null }
export function orderStateView(order: Record<string, unknown>, checkout: CheckoutState | null, requiresReview: boolean, now = Date.now()) {
  const statusInfo = stateLabel(order.status, CLIENT_STATUS_LABELS)
  const paymentInfo = stateLabel(order.payment_status, PAYMENT_LABELS)
  const refund = ['refund_pending', 'partially_refunded', 'refunded'].includes(String(order.payment_status))
  const paid = order.payment_status === 'paid'
  const review = requiresReview || checkout?.status === 'review_required'
  const activeCheckout = checkout?.status === 'pending' && Date.parse(checkout.expires_at) > now
  const financialPending = review || activeCheckout || order.payment_status === 'refund_pending' || order.status === 'refund_pending' || order.status === 'payment_review'
  const refresh = financialPending ? 15 : terminal.has(String(order.status)) && statusInfo.known && paymentInfo.known ? 0 : 60
  return {
    status_info: statusInfo,
    payment_info: { ...paymentInfo, is_paid: paid, has_confirmed_payment: paid || (refund && Boolean(order.paid_at)) },
    financial_review: { required: review, label: review ? CHECKOUT_LABELS.review_required.label : null, message: review ? CHECKOUT_LABELS.review_required.description : null },
    checkout_state: checkout ? { ...stateLabel(checkout.status, CHECKOUT_LABELS), created_at: checkout.created_at, expires_at: checkout.expires_at, paid_at: checkout.paid_at, expired: checkout.status === 'pending' && Date.parse(checkout.expires_at) <= now } : null,
    // Failed gateway callbacks are not durably recorded in the existing order API. Do not invent one.
    provider_attempt_status_available: false,
    refresh_after_seconds: refresh,
  }
}
