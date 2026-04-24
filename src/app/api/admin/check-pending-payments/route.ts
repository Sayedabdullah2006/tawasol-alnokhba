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
        console.log(`[PENDING_PAYMENTS] 🔍 Checking request ATH-${String(request.request_number).padStart(4, '0')}...`)

        // البحث في ميسر عن دفعات لهذا الطلب
        const moyasarSecretKey = process.env.MOYASAR_SECRET_KEY
        if (!moyasarSecretKey) {
          console.error('[PENDING_PAYMENTS] ❌ MOYASAR_SECRET_KEY not configured')
          continue
        }

        const authString = Buffer.from(`${moyasarSecretKey}:`).toString('base64')
        const requestNumber = `ATH-${String(request.request_number).padStart(4, '0')}`

        // البحث بوصف الطلب
        const searchResponse = await fetch(`https://api.moyasar.com/v1/payments?description=${encodeURIComponent(`دفع طلب ${requestNumber}`)}`, {
          headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json'
          }
        })

        if (searchResponse.ok) {
          const searchData = await searchResponse.json()

          // البحث عن دفعة ناجحة مطابقة
          const expectedAmount = Math.round(request.final_total * 100)
          const successfulPayment = searchData.payments?.find((p: any) =>
            p.status === 'paid' &&
            p.amount === expectedAmount &&
            (p.metadata?.request_id === request.id ||
             p.description?.includes(requestNumber))
          )

          if (successfulPayment) {
            console.log(`[PENDING_PAYMENTS] ✅ Found successful payment for ${requestNumber}: ${successfulPayment.id}`)

            // تحديث حالة الطلب
            const { error: updateError } = await supabase
              .from('publish_requests')
              .update({
                status: 'in_progress',
                moyasar_payment_id: successfulPayment.id,
                payment_status: 'paid',
                moyasar_reference: successfulPayment.source.reference_number || successfulPayment.id,
                admin_notes: 'تم إصلاح حالة الدفع تلقائياً - نظام مراقبة الدفعات المعلقة',
                updated_at: new Date().toISOString()
              })
              .eq('id', request.id)

            if (!updateError) {
              fixed.push({
                requestNumber,
                paymentId: successfulPayment.id,
                amount: request.final_total,
                client: request.client_name
              })
              console.log(`[PENDING_PAYMENTS] ✅ Fixed ${requestNumber}`)
            } else {
              console.error(`[PENDING_PAYMENTS] ❌ Failed to update ${requestNumber}:`, updateError)
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