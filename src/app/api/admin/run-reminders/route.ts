// API endpoint لتشغيل job التذكيرات اليومية يدوياً
// يمكن استخدامه للاختبار أو التشغيل الطارئ

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import {
  getReminderData,
  shouldSendReminder,
  sendReminder
} from '@/lib/email-reminders'
import { waitingForClient } from '@/lib/admin-actions'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()

    // التحقق من صلاحية المدير
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, ...params } = await request.json()

    switch (action) {
      case 'run-daily-job':
        return await handleRunDailyJob()

      case 'test-single-reminder':
        return await handleTestSingleReminder(params.requestId)

      case 'check-reminder-status':
        return await handleCheckReminderStatus(params.requestId)

      case 'get-reminder-stats':
        return await handleGetReminderStats()

      case 'reset-reminder-logs':
        return await handleResetReminderLogs(params.requestId)

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Reminders API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleRunDailyJob() {
  try {
    console.log('[REMINDERS] Starting manual daily job run...')
    const startTime = Date.now()

    const supabase = await createServiceRoleClient()

    // العثور على الطلبات التي تحتاج تذكيرات
    const { data: requests, error: requestsError } = await supabase
      .from('publish_requests')
      .select(`
        id,
        request_number,
        client_name,
        client_email,
        status,
        created_at,
        last_status_change,
        admin_quoted_price,
        final_total
      `)
      .in('status', ['quoted', 'approved', 'content_review'])
      .not('client_email', 'is', null)

    if (requestsError) {
      throw new Error(`Failed to fetch requests: ${requestsError.message}`)
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No requests found that need reminders',
        processed: 0,
        sent: 0,
        duration: Date.now() - startTime
      })
    }

    console.log(`[REMINDERS] Found ${requests.length} requests to check`)

    let processedCount = 0
    let sentCount = 0
    let skippedCount = 0
    const results: any[] = []

    for (const request of requests) {
      try {
        processedCount++

        // احصل على بيانات التذكير
        const reminderData = await getReminderData(request.id)
        if (!reminderData) {
          console.warn(`[REMINDERS] Could not get reminder data for ${request.id}`)
          continue
        }

        // تحقق من إمكانية إرسال تذكير
        if (!shouldSendReminder(reminderData)) {
          skippedCount++
          console.log(`[REMINDERS] Skipping ${reminderData.requestNumber}: conditions not met`)
          results.push({
            requestId: request.id,
            requestNumber: reminderData.requestNumber,
            status: request.status,
            action: 'skipped',
            reason: 'conditions_not_met',
            reminderCount: reminderData.reminderCount
          })
          continue
        }

        // إرسال التذكير (سيتم إرسال CC تلقائياً للإدارة)
        const reminderSent = await sendReminder(reminderData)

        if (reminderSent) {
          sentCount++
          results.push({
            requestId: request.id,
            requestNumber: reminderData.requestNumber,
            status: request.status,
            action: 'sent',
            reminderNumber: reminderData.reminderCount + 1,
            emailSent: true
          })
        } else {
          results.push({
            requestId: request.id,
            requestNumber: reminderData.requestNumber,
            status: request.status,
            action: 'failed',
            reason: 'email_send_failed'
          })
        }

      } catch (error) {
        console.error(`[REMINDERS] Error processing request ${request.id}:`, error)
        results.push({
          requestId: request.id,
          requestNumber: `ATH-${request.request_number.toString().padStart(4, '0')}`,
          status: request.status,
          action: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const duration = Date.now() - startTime

    console.log(`[REMINDERS] Manual job completed - Processed: ${processedCount}, Sent: ${sentCount}, Skipped: ${skippedCount}, Duration: ${duration}ms`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processed: processedCount,
      sent: sentCount,
      skipped: skippedCount,
      duration,
      results
    })

  } catch (error) {
    console.error('[REMINDERS] Manual job error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

async function handleTestSingleReminder(requestId: string) {
  try {
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    console.log(`[REMINDERS] Testing single reminder for request: ${requestId}`)

    // احصل على بيانات التذكير
    const reminderData = await getReminderData(requestId)
    if (!reminderData) {
      return NextResponse.json({ error: 'Request not found or invalid' }, { status: 404 })
    }

    // تحقق من الحالة
    if (!waitingForClient(reminderData.status as any)) {
      return NextResponse.json({
        error: 'Request status does not require client action',
        status: reminderData.status,
        requiresAction: false
      }, { status: 400 })
    }

    // إرسال التذكير (تجاهل الشروط الزمنية للاختبار، سيتم إرسال CC تلقائياً للإدارة)
    const reminderSent = await sendReminder(reminderData)

    return NextResponse.json({
      success: reminderSent,
      requestId,
      requestNumber: reminderData.requestNumber,
      status: reminderData.status,
      reminderNumber: reminderData.reminderCount + 1,
      clientEmail: reminderData.clientEmail,
      emailSent: reminderSent,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[REMINDERS] Test reminder error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function handleCheckReminderStatus(requestId: string) {
  try {
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const reminderData = await getReminderData(requestId)
    if (!reminderData) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const canSendReminder = shouldSendReminder(reminderData)
    const requiresAction = waitingForClient(reminderData.status as any)

    // احصل على سجل التذكيرات
    const supabase = await createServiceRoleClient()
    const { data: reminderLogs } = await supabase
      .from('email_reminder_logs')
      .select('reminder_number, sent_at, email_subject')
      .eq('request_id', requestId)
      .eq('reminder_type', reminderData.status)
      .order('sent_at', { ascending: false })

    return NextResponse.json({
      requestId,
      requestNumber: reminderData.requestNumber,
      status: reminderData.status,
      clientEmail: reminderData.clientEmail,
      requiresAction,
      canSendReminder,
      reminderCount: reminderData.reminderCount,
      lastStatusChange: reminderData.lastStatusChange,
      daysSinceChange: Math.floor(
        (Date.now() - new Date(reminderData.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24)
      ),
      reminderLogs: reminderLogs || []
    })

  } catch (error) {
    console.error('[REMINDERS] Check status error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function handleGetReminderStats() {
  try {
    const supabase = await createServiceRoleClient()

    // إحصائيات عامة
    const { data: stats } = await supabase
      .from('email_reminder_logs')
      .select('reminder_type, reminder_number, sent_at')
      .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // آخر 30 يوم

    // إحصائيات الطلبات الحالية
    const { data: currentRequests } = await supabase
      .from('publish_requests')
      .select('status, COUNT(*)')
      .in('status', ['quoted', 'approved', 'content_review'])
      .groupBy('status')

    // تلخيص الإحصائيات
    const statsSummary = stats?.reduce((acc, log) => {
      const key = log.reminder_type
      if (!acc[key]) {
        acc[key] = { total: 0, byNumber: {} }
      }
      acc[key].total++
      acc[key].byNumber[log.reminder_number] = (acc[key].byNumber[log.reminder_number] || 0) + 1
      return acc
    }, {} as any) || {}

    return NextResponse.json({
      last30Days: statsSummary,
      currentRequests: currentRequests || [],
      totalReminders: stats?.length || 0,
      generatedAt: new Date().toISOString()
    })

  } catch (error) {
    console.error('[REMINDERS] Get stats error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function handleResetReminderLogs(requestId: string) {
  try {
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    // حذف سجلات التذكيرات لهذا الطلب
    const { error, count } = await supabase
      .from('email_reminder_logs')
      .delete()
      .eq('request_id', requestId)

    if (error) {
      throw new Error(`Failed to reset logs: ${error.message}`)
    }

    console.log(`[REMINDERS] Reset reminder logs for request ${requestId}, deleted ${count} records`)

    return NextResponse.json({
      success: true,
      requestId,
      deletedCount: count || 0,
      message: 'Reminder logs reset successfully'
    })

  } catch (error) {
    console.error('[REMINDERS] Reset logs error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}