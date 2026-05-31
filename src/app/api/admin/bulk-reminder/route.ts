/**
 * Bulk Reminder Email API Route
 * Sends reminder emails to all clients whose requests match a given status.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendEmailWithRetry } from '@/lib/email-queue'
import { generateRequestNumber } from '@/lib/utils'
import { reminderTemplates, quotedDiscountTemplate, type ReminderType } from '@/lib/reminder-templates'

// Throttle between sends to avoid hitting Resend/Supabase Edge rate limits.
// 600ms ≈ 1.6 sends/sec — comfortably below Resend's free tier (2 req/sec).
const SEND_DELAY_MS = 600

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Allow this route to run longer than the default (some bulk batches are slow).
export const maxDuration = 300 // seconds

export async function POST(request: NextRequest) {
  try {
    // Admin auth check
    const authClient = await createServerSupabaseClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    const { status, discountPct } = await request.json() as {
      status: ReminderType
      discountPct?: number | null
    }

    if (!status || !(status in reminderTemplates)) {
      return NextResponse.json(
        { error: 'حالة غير صالحة للإرسال الجماعي' },
        { status: 400 }
      )
    }

    const applyDiscount = typeof discountPct === 'number' && discountPct > 0 && discountPct < 100
    if (applyDiscount && status !== 'quoted') {
      return NextResponse.json(
        { error: 'تطبيق الخصم متاح فقط للعروض في حالة "بانتظار موافقة العميل"' },
        { status: 400 }
      )
    }

    const supabase = await createServiceRoleClient()

    const { data: requests, error: fetchError } = await supabase
      .from('publish_requests')
      .select('id, client_name, client_email, request_number, status, admin_quoted_price, final_total')
      .eq('status', status)

    if (fetchError) {
      console.error('[BULK_REMINDER] Fetch error:', fetchError)
      return NextResponse.json({ error: 'فشل جلب الطلبات' }, { status: 500 })
    }

    const matchingRequests = requests ?? []
    const template = reminderTemplates[status]

    let sent = 0
    let failed = 0
    let skipped = 0
    let updated = 0
    const failedRequestNumbers: string[] = []

    for (let i = 0; i < matchingRequests.length; i++) {
      const r = matchingRequests[i]
      if (!r.client_email) {
        skipped++
        continue
      }

      const requestNumber = generateRequestNumber(r.request_number)
      let subject: string
      let html: string
      let newPrice: number | null = null
      let discountOriginalPrice: number | null = null

      if (applyDiscount) {
        const originalPrice = Number(r.admin_quoted_price ?? r.final_total ?? 0)
        if (originalPrice <= 0) {
          skipped++
          continue
        }
        discountOriginalPrice = originalPrice
        const computedNew = Math.round(originalPrice * (1 - (discountPct! / 100)) * 100) / 100
        newPrice = computedNew
        subject = quotedDiscountTemplate.subject(requestNumber, discountPct!)
        html = quotedDiscountTemplate.html(
          r.client_name ?? 'عزيزنا',
          requestNumber,
          originalPrice,
          computedNew,
          discountPct!,
        )
      } else {
        const amount = r.final_total ?? r.admin_quoted_price ?? undefined
        subject = template.subject(requestNumber)
        html = template.html(r.client_name ?? 'عزيزنا', requestNumber, amount)
      }

      // Use retry-aware sender — handles transient Resend/Edge rate-limit blips
      // by retrying with exponential backoff. Basic mode skips the spam-scoring
      // pre-flight which would over-flag reminder content.
      const result = await sendEmailWithRetry({
        to: r.client_email,
        subject,
        html,
        context: applyDiscount ? `bulk-discount-${requestNumber}` : `bulk-reminder-${requestNumber}`,
        retries: 3,
        enhanced: false,
        category: 'notification',
      })

      if (result.success) {
        sent++

        // Critical update: price changes — kept separate so a missing
        // last_reminder_sent column won't roll back the price write.
        if (applyDiscount && newPrice !== null) {
          const { error: priceErr } = await supabase
            .from('publish_requests')
            .update({
              admin_quoted_price: newPrice,
              final_total: newPrice,
              offer_discount_pct: discountPct,
              offer_original_price: discountOriginalPrice,
              offer_discount_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.id)

          if (priceErr) {
            console.error(`[BULK_REMINDER] Price update failed for ${requestNumber}:`, priceErr.message)
          } else {
            updated++
          }
        }

        // Non-critical timestamp bump — tolerate missing column
        const { error: stampErr } = await supabase
          .from('publish_requests')
          .update({
            last_reminder_sent: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id)

        if (stampErr) {
          console.warn(`[BULK_REMINDER] last_reminder_sent update skipped for ${requestNumber}:`, stampErr.message)
        }
      } else {
        failed++
        failedRequestNumbers.push(requestNumber)
        console.warn(`[BULK_REMINDER] Failed for ${requestNumber}: ${result.error}`)
      }

      // Throttle between sends (skip after the last one)
      if (i < matchingRequests.length - 1) {
        await sleep(SEND_DELAY_MS)
      }
    }

    console.log(`[BULK_REMINDER] status=${status} sent=${sent} failed=${failed} skipped=${skipped} priceUpdated=${updated}`)

    return NextResponse.json({
      success: true,
      total: matchingRequests.length,
      sent,
      failed,
      skipped,
      priceUpdated: updated,
      failedRequestNumbers,
    })
  } catch (error) {
    console.error('[BULK_REMINDER] Exception:', error)
    return NextResponse.json(
      { error: 'خطأ في الخادم أثناء الإرسال الجماعي' },
      { status: 500 }
    )
  }
}
