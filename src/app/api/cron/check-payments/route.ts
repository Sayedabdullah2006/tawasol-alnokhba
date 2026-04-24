/**
 * Cron job للفحص التلقائي للدفعات المعلقة
 * يعمل كل ساعة للتحقق من الطلبات التي لم تُحدث حالتها
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  console.log('[PAYMENT_CRON] 🔄 Starting automated payment check...')

  try {
    // التحقق من مفتاح الأمان للـ cron
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET_KEY

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[PAYMENT_CRON] 🚫 Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // استدعاء نفس منطق فحص الدفعات المعلقة
    const checkResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/check-pending-payments`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Cron-Job/1.0',
        'X-Source': 'automated-check'
      }
    })

    if (!checkResponse.ok) {
      throw new Error(`Check API failed: ${checkResponse.status}`)
    }

    const checkData = await checkResponse.json()
    console.log('[PAYMENT_CRON] 📊 Check results:', {
      totalChecked: checkData.summary?.totalChecked || 0,
      fixed: checkData.summary?.fixed || 0,
      issues: checkData.summary?.issues || 0
    })

    // إرسال إشعار للإدارة إذا تم العثور على مشاكل
    if (checkData.issues?.length > 0) {
      console.log('[PAYMENT_CRON] ⚠️ Found payment issues, notifying admin...')

      try {
        await notifyAdminAboutPaymentIssues(checkData.issues)
      } catch (notifyError) {
        console.error('[PAYMENT_CRON] ❌ Failed to notify admin:', notifyError)
      }
    }

    // تسجيل النتائج في قاعدة البيانات
    try {
      const supabase = await createServiceRoleClient()
      await supabase
        .from('cron_logs')
        .insert({
          job_name: 'check-payments',
          status: 'success',
          summary: checkData.summary,
          details: {
            fixed: checkData.fixed,
            issues: checkData.issues
          },
          executed_at: new Date().toISOString()
        })
    } catch (logError) {
      console.error('[PAYMENT_CRON] ⚠️ Failed to log cron result:', logError)
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: checkData.summary,
      fixed: checkData.fixed?.length || 0,
      issues: checkData.issues?.length || 0
    })

  } catch (error) {
    console.error('[PAYMENT_CRON] 💥 Cron job failed:', error)

    // تسجيل الفشل
    try {
      const supabase = await createServiceRoleClient()
      await supabase
        .from('cron_logs')
        .insert({
          job_name: 'check-payments',
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          executed_at: new Date().toISOString()
        })
    } catch (logError) {
      console.error('[PAYMENT_CRON] ⚠️ Failed to log cron error:', logError)
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * إرسال إشعار للإدارة عن مشاكل الدفع
 */
async function notifyAdminAboutPaymentIssues(issues: any[]) {
  console.log('[PAYMENT_CRON] 📧 Sending admin notification about payment issues...')

  const supabase = await createServiceRoleClient()

  // إنشاء ملخص المشاكل
  const issuesSummary = issues.map(issue =>
    `• ${issue.requestNumber} - ${issue.client} (${issue.amount} ر.س) - ${issue.issue}`
  ).join('\n')

  // يمكن إضافة إرسال بريد إلكتروني أو إشعار Slack هنا
  // لكن الآن سنكتفي بتسجيل الإشعار في قاعدة البيانات

  try {
    await supabase
      .from('admin_notifications')
      .insert({
        type: 'payment_issues',
        title: `${issues.length} مشكلة في الدفعات تحتاج مراجعة`,
        message: `تم العثور على ${issues.length} طلب يحتاج مراجعة يدوية:\n\n${issuesSummary}`,
        priority: 'high',
        created_at: new Date().toISOString()
      })
  } catch (err) {
    console.error('[PAYMENT_CRON] ❌ Failed to create admin notification:', err)
  }

  console.log(`[PAYMENT_CRON] ✅ Admin notification created for ${issues.length} payment issues`)
}

// دعم POST أيضاً للاختبار اليدوي
export async function POST(request: NextRequest) {
  return GET(request)
}