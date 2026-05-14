/**
 * Bulk Reminder Email API Route
 * Sends reminder emails to all clients whose requests match a given status.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/email'
import { generateRequestNumber } from '@/lib/utils'
import { reminderTemplates, type ReminderType } from '@/lib/reminder-templates'

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

    const { status } = await request.json() as { status: ReminderType }

    if (!status || !(status in reminderTemplates)) {
      return NextResponse.json(
        { error: 'حالة غير صالحة للإرسال الجماعي' },
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
    const failedRequestNumbers: string[] = []

    for (const r of matchingRequests) {
      if (!r.client_email) {
        skipped++
        continue
      }

      const requestNumber = generateRequestNumber(r.request_number)
      const subject = template.subject(requestNumber)
      const amount = r.final_total ?? r.admin_quoted_price ?? undefined
      const html = template.html(r.client_name ?? 'عزيزنا', requestNumber, amount)

      const ok = await sendEmail(r.client_email, subject, html)
      if (ok) {
        sent++
        await supabase
          .from('publish_requests')
          .update({
            last_reminder_sent: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id)
      } else {
        failed++
        failedRequestNumbers.push(requestNumber)
      }
    }

    console.log(`[BULK_REMINDER] status=${status} sent=${sent} failed=${failed} skipped=${skipped}`)

    return NextResponse.json({
      success: true,
      total: matchingRequests.length,
      sent,
      failed,
      skipped,
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
