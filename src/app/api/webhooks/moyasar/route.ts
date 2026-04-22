/**
 * Moyasar Webhook Handler
 * يستقبل إشعارات من Moyasar عند تغيير حالة الدفع
 * مهم للموثوقية في حالة فشل الـ callback العادي
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import type { MoyasarPayment } from '@/types/moyasar';

export async function POST(request: NextRequest) {
  console.log('[MOYASAR_WEBHOOK] 🔔 Webhook received');

  try {
    // التحقق من الأمان - Moyasar Secret Token
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.MOYASAR_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error('[MOYASAR_WEBHOOK] ❌ MOYASAR_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      console.error('[MOYASAR_WEBHOOK] 🚫 Invalid webhook authentication');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.text();
    const webhookData = JSON.parse(body);
    
    console.log('[MOYASAR_WEBHOOK] 📋 Webhook data:', {
      type: webhookData.type,
      payment_id: webhookData.data?.id,
      payment_status: webhookData.data?.status
    });

    // معالجة أحداث الدفع فقط
    if (webhookData.type.startsWith('payment.') && webhookData.data) {
      const payment: MoyasarPayment = webhookData.data;
      
      if (payment.status === 'paid' && payment.metadata?.request_id) {
        // استدعاء نفس منطق التحقق المستخدم في payment/verify
        const verifyResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentId: payment.id,
            requestId: payment.metadata.request_id
          })
        });

        if (verifyResponse.ok) {
          console.log(`[MOYASAR_WEBHOOK] ✅ Payment verified via webhook: ${payment.id}`);
        } else {
          console.error(`[MOYASAR_WEBHOOK] ❌ Failed to verify payment: ${payment.id}`);
        }
      }
    }

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('[MOYASAR_WEBHOOK] 💥 Webhook error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Moyasar webhook endpoint is running',
    timestamp: new Date().toISOString()
  });
}
