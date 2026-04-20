// Email dispatch — calls the `send-email` Supabase Edge Function so that the
// Resend API key never leaves Supabase secrets. Failures are logged but do not
// throw, so a missing key or transient network blip never blocks the request
// pipeline that triggered the email.

import { createServiceRoleClient } from './supabase-server'
import * as templates from './email-templates'

const ADMIN_EMAIL = 'first1saudi@gmail.com'

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<boolean> {
  if (!to || (Array.isArray(to) && to.length === 0)) return false
  try {
    const client = await createServiceRoleClient()
    const { data, error } = await client.functions.invoke('send-email', {
      body: { to, subject, html },
    })
    if (error || (data && data.ok === false)) {
      console.error('Email send failed:', error?.message ?? data)
      return false
    }
    return true
  } catch (err) {
    console.error('Email send exception:', err)
    return false
  }
}

// ─── Convenience wrappers per event ────────────────────────────────────

export async function notifyNewRequestToAdmin(d: templates.ClientRequestData) {
  const t = templates.newRequestToAdmin(d)
  return sendEmail(ADMIN_EMAIL, t.subject, t.html)
}

export async function notifyRequestReceivedToClient(d: templates.ClientRequestData) {
  if (!d.clientEmail) return false
  const t = templates.requestReceivedToClient(d)
  return sendEmail(d.clientEmail, t.subject, t.html)
}

export async function notifyQuoteReadyToClient(args: {
  email: string; requestNumber: string; clientName: string; price: number; reach: number
}) {
  const t = templates.quoteReadyToClient(args)
  return sendEmail(args.email, t.subject, t.html)
}

export async function notifyFreeGiftToClient(args: {
  email: string; requestNumber: string; clientName: string; adminMessage: string
}) {
  const t = templates.freeGiftToClient(args)
  return sendEmail(args.email, t.subject, t.html)
}

export async function notifyPaymentConfirmedToClient(args: {
  email: string; requestNumber: string; clientName: string; total: number
}) {
  const t = templates.paymentConfirmedToClient(args)
  return sendEmail(args.email, t.subject, t.html)
}

export async function notifyInProgressToClient(args: {
  email: string; requestNumber: string; clientName: string
}) {
  const t = templates.inProgressToClient(args)
  return sendEmail(args.email, t.subject, t.html)
}

export async function notifyCompletedToClient(args: {
  email: string; requestNumber: string; clientName: string
}) {
  const t = templates.completedToClient(args)
  return sendEmail(args.email, t.subject, t.html)
}

export async function notifyRejectedToClient(args: {
  email: string; requestNumber: string; clientName: string; reason: string
}) {
  const t = templates.rejectedToClient(args)
  return sendEmail(args.email, t.subject, t.html)
}

// Old name kept for compatibility with the existing submit-request route.
export async function sendNewRequestEmail(args: {
  requestNumber: string; clientName: string; clientEmail: string; clientPhone: string
  category: string; title: string; content: string; channels: string[]
}) {
  return notifyNewRequestToAdmin(args)
}
