// Email dispatch — calls the `send-email` Supabase Edge Function so that the
// Resend API key never leaves Supabase secrets. Failures are logged but do not
// throw, so a missing key or transient network blip never blocks the request
// pipeline that triggered the email.

import { customerEmailContext, type CustomerMailReference } from './customer-email'
import { withEmailBrand, type CustomerEmailBrandId, type CustomerEmailContext } from './email-brand'
import { createServiceRoleClient } from './supabase-server'
import * as templates from './email-templates'
import { ensureServiceInvoice, markServiceInvoiceEmailed, type PaymentInvoiceOverrides } from './service-invoice'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || 'first1saudi@gmail.com'
const ADMIN_CC_EMAIL = process.env.ADMIN_CC_EMAIL?.trim() || ADMIN_EMAIL // نسخة لجميع إيميلات العملاء

export type EmailAttachment = { filename: string; content: string; contentType?: string }

export async function sendEmail(to: string | string[], subject: string, html: string, attachments?: EmailAttachment[], brand: CustomerEmailBrandId = 'nukhba'): Promise<boolean> {
  if (!to || (Array.isArray(to) && to.length === 0)) return false

  try {
    console.log(`[EMAIL] Sending basic email: ${subject} to ${Array.isArray(to) ? to.join(', ') : to}`)

    // Use basic email service directly (enhanced system temporarily disabled)
    const recipients = Array.isArray(to) ? to : [to]
    const cc = ADMIN_CC_EMAIL && !recipients.some(email => email.trim().toLowerCase() === ADMIN_CC_EMAIL.toLowerCase())
      ? ADMIN_CC_EMAIL
      : undefined
    const client = await createServiceRoleClient()
    const { data, error } = await client.functions.invoke('send-email', {
      body: {
        to,
        subject,
        html,
        cc,
        attachments,
        brand,
      },
    })

    if (error || (data && data.ok === false)) {
      console.error('[EMAIL] Basic email send failed:', error?.message ?? data)
      return false
    }

    console.log('[EMAIL] ✅ Basic email sent successfully')
    return true
  } catch (err) {
    console.error('[EMAIL] Basic email send exception:', err)
    return false
  }
}

type MailTemplate = {subject:string;html:string}
async function sendTemplateEmail(to:string,context:CustomerEmailContext,render:()=>MailTemplate,attachments?:EmailAttachment[]){
  const t=withEmailBrand(context,render)
  const subject=context.brand==='first1saudi'&&!t.subject.includes('شبكة أول سعودي')?t.subject+' · شبكة أول سعودي':t.subject
  return sendEmail(to,subject,t.html,attachments,context.brand)
}
async function sendCustomerEmail(reference:CustomerMailReference,render:()=>MailTemplate){
  try {
    const context=await customerEmailContext(reference)
    if(!context)return false
    return sendTemplateEmail(reference.email??reference.clientEmail??'',context,render)
  } catch { console.error('[EMAIL] Customer notification context unavailable; sending skipped');return false }
}

// ─── Convenience wrappers per event ────────────────────────────────────

export async function notifyNewRequestToAdmin(d: templates.ClientRequestData) {
  const t = templates.newRequestToAdmin(d)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyAdminIntake(d: templates.AdminIntakeNotificationData) {
  const t = templates.adminIntakeNotification(d)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyRequestReceivedToClient(d: templates.ClientRequestData) {
  if (!d.clientEmail) return false
  return sendCustomerEmail(d,()=>templates.requestReceivedToClient(d))
}

export async function notifyQuoteReadyToClient(args: {
  email: string; requestNumber: string; clientName: string; price: number; reach: number
  quoteExpiresAt?: string | null; adminMessage?: string
}) {
  return sendCustomerEmail(args,()=>templates.quoteReadyToClient(args))
}

export async function notifyFreeGiftToClient(args: {
  email: string; requestNumber: string; clientName: string; adminMessage: string
}) {
  return sendCustomerEmail(args,()=>templates.freeGiftToClient(args))
}

export async function notifyPaymentConfirmedToClient(args: {
  email: string; requestId: string; requestNumber: string; clientName: string; total: number
  payment?: PaymentInvoiceOverrides
}) {
  let context:CustomerEmailContext|null
  try {context=await customerEmailContext(args)} catch {return false}
  if(!context)return false
  try {
    const invoice = await ensureServiceInvoice(args.requestId, args.payment)
    const invoiceDownloadUrl = `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://nukhba.media'}/api/invoices/request/${args.requestId}`
    const sent = await sendTemplateEmail(args.email,context,()=>templates.paymentConfirmedToClient({
      ...args,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDownloadUrl,
    }), [{
      filename: invoice.filename,
      content: invoice.pdf.toString('base64'),
      contentType: 'application/pdf',
    }])
    if (sent) await markServiceInvoiceEmailed(invoice.id)
    return sent
  } catch (error) {
    console.error('[INVOICE] Failed to create or attach payment invoice:', error)
    return sendTemplateEmail(args.email,context,()=>templates.paymentConfirmedToClient(args))
  }
}

export async function notifyFreeApprovedToClient(args: {
  email: string; requestNumber: string; clientName: string
}) {
  return sendCustomerEmail(args,()=>templates.freeApprovedToClient(args))
}

export async function notifyQuoteApprovedAwaitingPaymentToClient(args: {
  email: string; requestNumber: string; clientName: string; total: number; requestId?: string
}) {
  return sendCustomerEmail(args,()=>templates.quoteApprovedAwaitingPaymentToClient(args))
}

export async function notifyInProgressToClient(args: {
  requestId?: string; email: string; requestNumber: string; clientName: string
}) {
  return sendCustomerEmail(args,()=>templates.inProgressToClient(args))
}

export async function notifyCompletedToClient(args: {
  requestId?: string; email: string; requestNumber: string; clientName: string; reviewUrl?: string
}) {
  return sendCustomerEmail(args,()=>templates.completedToClient(args))
}

export async function notifyRejectedToClient(args: {
  requestId?: string; email: string; requestNumber: string; clientName: string; reason: string
}) {
  return sendCustomerEmail(args,()=>templates.rejectedToClient(args))
}

export async function sendRegistrationCode(args: {
  email: string; code: string; clientName?: string; ttlMinutes: number; brand?: CustomerEmailBrandId
}) {
  return sendTemplateEmail(args.email,{brand:args.brand??'nukhba'},()=>templates.registrationCodeToClient(args))
}

export async function sendLoginCode(args: {
  email: string; code: string; ttlMinutes: number; brand?: CustomerEmailBrandId
}) {
  return sendTemplateEmail(args.email,{brand:args.brand??'nukhba'},()=>templates.loginCodeToClient(args))
}

export async function sendWelcomeEmail(args: {
  email: string; clientName: string; brand?: CustomerEmailBrandId
}) {
  return sendTemplateEmail(args.email,{brand:args.brand??'nukhba'},()=>templates.welcomeToClient(args))
}

export async function notifyNewAccountToAdmin(args: {
  clientName: string; clientEmail: string
}) {
  const t = templates.newAccountToAdmin(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function sendResetPasswordCode(args: {
  email: string; code: string; ttlMinutes: number; brand?: CustomerEmailBrandId
}) {
  return sendTemplateEmail(args.email,{brand:args.brand??'nukhba'},()=>templates.resetPasswordCodeToClient(args))
}

export async function notifyStatusUpdateToClient(args: {
  requestId?: string; email: string; requestNumber: string; clientName: string; status: string; statusLabel: string; adminNotes?: string
}) {
  return sendCustomerEmail(args,()=>templates.statusUpdateToClient(args))
}

// ─── Content Review Email Functions ───

export async function notifyContentReadyForReview(args: {
  email: string; requestNumber: string; clientName: string; proposedContent: string; proposedImages: string[]; edited?: boolean; requestId?: string
}) {
  return sendCustomerEmail(args,()=>templates.contentReadyForReview(args))
}

export async function sendRequestReviewEmail(args: {
  email: string; requestNumber: string; clientName: string; reviewUrl: string
}) {
  return sendCustomerEmail(args,()=>templates.requestReviewToClient(args))
}

export async function notifyRefundUpdateToClient(args: {
  requestId?: string; email: string; requestNumber: string; clientName: string; amount: number; timing: string; isPending: boolean
}) {
  return sendCustomerEmail(args,()=>templates.refundUpdateToClient(args))
}

export async function notifyCampaignReadyForReview(args: {
  requestNumber: string
  requestId: string
  clientName: string
  email: string
  posts: Array<{ title: string; content: string; proposedDate?: string | null; images: string[] }>
}) {
  return sendCustomerEmail(args,()=>templates.campaignReadyForReview(args))
}

export async function notifyContentApprovedToAdmin(args: {
  requestNumber: string; clientName: string
}) {
  const t = templates.contentApprovedToAdmin(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyContentApprovedToClient(args: {
  email: string; requestNumber: string; clientName: string
}) {
  return sendCustomerEmail(args,()=>templates.contentApprovedToClient(args))
}

export async function notifyContentChangesRequested(args: {
  requestNumber: string; clientName: string; feedback: string; proposedContent: string
}) {
  const t = templates.contentChangesRequested(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyInfoRequestedToClient(args: {
  requestId?: string; email: string; requestNumber: string; clientName: string; message: string
}) {
  return sendCustomerEmail(args,()=>templates.infoRequestedToClient(args))
}

export async function notifyMotivateUser(args: { email: string; clientName?: string }) {
  return sendCustomerEmail(args,()=>templates.motivateUserToSubmit(args))
}

export async function notifyRequestRecoveryFirst(args: templates.RequestRecoveryEmailData) {
  return sendCustomerEmail(args,()=>templates.requestRecoveryFirst(args))
}

export async function notifyRequestRecoverySecond(args: templates.RequestRecoveryEmailData) {
  return sendCustomerEmail(args,()=>templates.requestRecoverySecond(args))
}

export async function notifyRequestRecoveryOffer(args: templates.RequestRecoveryEmailData & { code: string; expiresAt: string }) {
  return sendCustomerEmail(args,()=>templates.requestRecoveryOffer(args))
}

export async function notifyPostCompletedToClient(args: {
  email: string; requestNumber: string; clientName: string; postTitle: string; postIndex: number
}) {
  return sendCustomerEmail(args,()=>templates.postCompletedToClient(args))
}

export async function notifyInfoResubmittedToAdmin(args: {
  requestNumber: string; clientName: string
}) {
  const t = templates.infoResubmittedToAdmin(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyQuoteApprovedToAdmin(args: {
  requestNumber: string; clientName: string; totalAmount: number; hasExtras: boolean; selectedExtras: string[]
}) {
  const t = templates.quoteApprovedToAdmin(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyBankTransferReceivedToAdmin(args: {
  requestNumber: string; clientName: string; totalAmount: number
}) {
  const t = templates.bankTransferReceivedToAdmin(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

// ─── Quote Rejection and Negotiation Email Functions ───

export async function notifyQuoteRejectedByClient(args: {
  requestNumber: string; clientName: string; rejectionReason: string; quotedPrice: number
}) {
  const t = templates.quoteRejectedByClient(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyQuoteRejectionToClient(args: {
  email: string; requestNumber: string; clientName: string
}) {
  return sendCustomerEmail(args,()=>templates.quoteRejectionToClient(args))
}

export async function notifyNegotiationRequestedByClient(args: {
  requestNumber: string; clientName: string; negotiationReason: string; originalPrice: number; proposedPrice?: number | null
}) {
  const t = templates.negotiationRequestedByClient(args)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyNegotiationRequestToClient(args: {
  email: string; requestNumber: string; clientName: string
}) {
  return sendCustomerEmail(args,()=>templates.negotiationRequestToClient(args))
}

export async function notifyNegotiatedQuoteToClient(args: {
  email: string; requestNumber: string; clientName: string; originalPrice: number; newPrice: number; discountPercentage: number; adminMessage: string; priceSource?: string
}) {
  return sendCustomerEmail(args,()=>templates.negotiatedQuoteToClient(args))
}

export async function notifyNegotiationRejectedToClient(args: {
  email: string; requestNumber: string; clientName: string; originalPrice: number; adminMessage?: string
}) {
  return sendCustomerEmail(args,()=>templates.negotiationRejectedToClient(args))
}

export async function notifyDiscountCodeToClient(args: {
  email: string
  clientName: string
  code: string
  discountPct: number
  occasion: string | null
  expiresAt: string
  adminMessage: string
  requestId: string
}) {
  return sendCustomerEmail(args,()=>templates.discountCodeToClient(args))
}

// Old name kept for compatibility with the existing submit-request route.
export async function sendNewRequestEmail(args: {
  requestNumber: string; clientName: string; clientEmail: string; clientPhone: string
  category: string; title: string; content: string; channels: string[]
}) {
  return notifyNewRequestToAdmin(args)
}
