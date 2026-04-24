/**
 * Moyasar Webhook Handler
 * يستقبل إشعارات من Moyasar عند تغيير حالة الدفع
 * مهم للموثوقية في حالة فشل الـ callback العادي
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import type { MoyasarPayment } from '@/types/moyasar';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[MOYASAR_WEBHOOK] 🔔 Webhook ${requestId} received`);

  try {
    const supabase = await createServiceRoleClient();
    const body = await request.text();
    const webhookData = JSON.parse(body);

    // تسجيل Webhook في قاعدة البيانات للمراقبة
    try {
      await supabase
        .from('webhook_logs')
        .insert({
          event_type: webhookData.type || 'unknown',
          data: webhookData,
          status: 'received',
          created_at: new Date().toISOString()
        })
    } catch (err) {
      console.error('[MOYASAR_WEBHOOK] ⚠️ Failed to log webhook:', err)
    }

    // التحقق من الأمان - Moyasar Secret Token
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.MOYASAR_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error(`[MOYASAR_WEBHOOK] ❌ ${requestId} MOYASAR_WEBHOOK_SECRET not configured`);
      try {
        await supabase.from('webhook_logs').update({
          status: 'failed',
          response_message: 'MOYASAR_WEBHOOK_SECRET not configured'
        }).eq('id', requestId)
      } catch {} // Ignore logging errors
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      console.error(`[MOYASAR_WEBHOOK] 🚫 ${requestId} Invalid webhook authentication`);
      try {
        await supabase.from('webhook_logs').update({
          status: 'unauthorized',
          response_message: 'Invalid webhook authentication'
        }).eq('id', requestId)
      } catch {} // Ignore logging errors
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[MOYASAR_WEBHOOK] 📋 ${requestId} Webhook data:`, {
      type: webhookData.type,
      payment_id: webhookData.data?.id,
      payment_status: webhookData.data?.status
    });

    // معالجة أحداث الدفع فقط
    if (webhookData.type.startsWith('payment.') && webhookData.data) {
      const payment: MoyasarPayment = webhookData.data;

      if (payment.status === 'paid' && payment.metadata?.request_id) {
        console.log(`[MOYASAR_WEBHOOK] 💰 ${requestId} Processing successful payment: ${payment.id}`);

        try {
          // استدعاء نفس منطق التحقق المستخدم في payment/verify مع إعادة المحاولة
          let attempts = 0;
          const maxAttempts = 3;
          let verifySuccess = false;

          while (attempts < maxAttempts && !verifySuccess) {
            attempts++;
            console.log(`[MOYASAR_WEBHOOK] 🔄 ${requestId} Verification attempt ${attempts}/${maxAttempts}`);

            const verifyResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/payment/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentId: payment.id,
                requestId: payment.metadata.request_id
              })
            });

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              console.log(`[MOYASAR_WEBHOOK] ✅ ${requestId} Payment verified via webhook: ${payment.id}`);

              try {
                await supabase.from('webhook_logs').update({
                  status: 'success',
                  response_message: `Payment verified successfully on attempt ${attempts}`
                }).eq('id', requestId)
              } catch {} // Ignore logging errors

              verifySuccess = true;
            } else {
              let errorData = {}
              try {
                errorData = await verifyResponse.json()
              } catch {} // Ignore JSON parsing errors
              console.error(`[MOYASAR_WEBHOOK] ❌ ${requestId} Verification failed attempt ${attempts}:`, errorData);

              if (attempts === maxAttempts) {
                try {
                  await supabase.from('webhook_logs').update({
                    status: 'failed',
                    response_message: `Failed to verify payment after ${attempts} attempts: ${(errorData as any).error || 'Unknown error'}`
                  }).eq('id', requestId)
                } catch {} // Ignore logging errors
              } else {
                // تأخير قبل إعادة المحاولة
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
              }
            }
          }

        } catch (verifyError) {
          console.error(`[MOYASAR_WEBHOOK] 💥 ${requestId} Verification error:`, verifyError);
          try {
            await supabase.from('webhook_logs').update({
              status: 'error',
              response_message: `Verification error: ${verifyError instanceof Error ? verifyError.message : 'Unknown error'}`
            }).eq('id', requestId)
          } catch {} // Ignore logging errors
        }

      } else {
        console.log(`[MOYASAR_WEBHOOK] ⚠️ ${requestId} Skipping payment - status: ${payment.status}, has request_id: ${!!payment.metadata?.request_id}`);
        try {
          await supabase.from('webhook_logs').update({
            status: 'skipped',
            response_message: `Payment status: ${payment.status}, has request_id: ${!!payment.metadata?.request_id}`
          }).eq('id', requestId)
        } catch {} // Ignore logging errors
      }
    } else {
      console.log(`[MOYASAR_WEBHOOK] ⚠️ ${requestId} Skipping non-payment event: ${webhookData.type}`);
      try {
        await supabase.from('webhook_logs').update({
          status: 'skipped',
          response_message: `Non-payment event: ${webhookData.type}`
        }).eq('id', requestId)
      } catch {} // Ignore logging errors
    }

    return NextResponse.json({ status: 'success', requestId });

  } catch (error) {
    console.error(`[MOYASAR_WEBHOOK] 💥 ${requestId} Webhook error:`, error);

    try {
      const supabase = await createServiceRoleClient();
      await supabase.from('webhook_logs').update({
        status: 'error',
        response_message: error instanceof Error ? error.message : 'Unknown error'
      }).eq('id', requestId)
    } catch {} // Ignore logging errors

    return NextResponse.json({ status: 'error', requestId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Moyasar webhook endpoint is running',
    timestamp: new Date().toISOString()
  });
}
