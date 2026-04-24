/**
 * نظام فحص الدفعات المعلقة
 * يتحقق من الطلبات التي لم تُحدث حالتها رغم وجود دفعات ناجحة
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function GET() {
  console.log('[PENDING_PAYMENTS] 🔍 Starting pending payments check...')

  try {
    const supabase = await createServiceRoleClient()

    // البحث عن الطلبات في حالة "approved" لأكثر من ساعة
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: pendingRequests, error: requestsError } = await supabase
      .from('publish_requests')
      .select('id, request_number, client_name, client_email, final_total, updated_at')
      .eq('status', 'approved')
      .lt('updated_at', oneHourAgo)

    if (requestsError) {
      console.error('[PENDING_PAYMENTS] ❌ Error fetching pending requests:', requestsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    console.log(`[PENDING_PAYMENTS] 📊 Found ${pendingRequests.length} pending requests`)

    const issues = []
    const fixed = []

    // فحص كل طلب معلق
    for (const request of pendingRequests) {
      try {
        const requestNumber = `ATH-${String(request.request_number).padStart(4, '0')}`
        console.log(`[PENDING_PAYMENTS] 🔍 Checking request ${requestNumber}...`)

        // إذا كان لديه معرف دفع محفوظ، تحقق منه مباشرة
        if (request.moyasar_payment_id) {
          const { verifyAndUpdatePayment } = await import('@/lib/moyasar-server')
          const result = await verifyAndUpdatePayment(request.moyasar_payment_id, request.id)

          console.log(`[PENDING_PAYMENTS] Request ${requestNumber}:`, result.reason)

          if (result.success && result.reason === 'verified_and_updated') {
            fixed.push({
              requestNumber,
              paymentId: request.moyasar_payment_id,
              amount: request.final_total,
              client: request.client_name
            })
          }
          continue
        }

        // إذا لم يكن هناك معرف دفع محفوظ، ابحث في ميسر عن دفعات حديثة
        const { buildAuthHeader } = await import('@/lib/moyasar')

        const searchResponse = await fetch('https://api.moyasar.com/v1/payments', {
          headers: {
            Authorization: buildAuthHeader(),
            'Content-Type': 'application/json'
          }
        })

        if (searchResponse.ok) {
          const { payments } = await searchResponse.json()

          // البحث عن دفعة مطابقة بواسطة metadata
          const match = payments?.find((p: any) =>
            p.metadata?.request_id === request.id &&
            p.status === 'paid'
          )

          if (match) {
            console.log(`[PENDING_PAYMENTS] ✅ Found matching payment for ${requestNumber}: ${match.id}`)

            const { verifyAndUpdatePayment } = await import('@/lib/moyasar-server')
            const result = await verifyAndUpdatePayment(match.id, request.id)

            if (result.success && result.reason === 'verified_and_updated') {
              fixed.push({
                requestNumber,
                paymentId: match.id,
                amount: request.final_total,
                client: request.client_name
              })
              console.log(`[PENDING_PAYMENTS] ✅ Fixed request ${requestNumber}:`, result.reason)
            } else {
              console.error(`[PENDING_PAYMENTS] ❌ Failed to verify ${requestNumber}:`, result.reason)
              issues.push({
                requestNumber,
                client: request.client_name,
                amount: request.final_total,
                updatedAt: request.updated_at,
                issue: `فشل التحقق: ${result.reason}`
              })
            }
          } else {
            issues.push({
              requestNumber,
              client: request.client_name,
              amount: request.final_total,
              updatedAt: request.updated_at,
              issue: 'لا توجد دفعة مطابقة في ميسر'
            })
            console.log(`[PENDING_PAYMENTS] ⚠️ No matching payment found for ${requestNumber}`)
          }
        } else {
          console.error(`[PENDING_PAYMENTS] ❌ Moyasar API error for ${requestNumber}:`, searchResponse.status)
          issues.push({
            requestNumber,
            client: request.client_name,
            amount: request.final_total,
            updatedAt: request.updated_at,
            issue: 'خطأ في الاتصال بميسر'
          })
        }

      } catch (error) {
        console.error(`[PENDING_PAYMENTS] 💥 Error checking request ${request.request_number}:`, error)
        issues.push({
          requestNumber: `ATH-${String(request.request_number).padStart(4, '0')}`,
          client: request.client_name,
          amount: request.final_total,
          updatedAt: request.updated_at,
          issue: 'خطأ في الفحص'
        })
      }
    }

    console.log(`[PENDING_PAYMENTS] 🎯 Summary: ${fixed.length} fixed, ${issues.length} issues`)

    return NextResponse.json({
      success: true,
      summary: {
        totalChecked: pendingRequests.length,
        fixed: fixed.length,
        issues: issues.length
      },
      fixed,
      issues
    })

  } catch (error) {
    console.error('[PENDING_PAYMENTS] 💥 System error:', error)
    return NextResponse.json({ error: 'System error' }, { status: 500 })
  }
}

export async function POST() {
  // تشغيل الفحص يدوياً من الإدارة
  return GET()
}