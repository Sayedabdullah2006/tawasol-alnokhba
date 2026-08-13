/**
 * Moyasar Webhook Handler
 * يستقبل إشعارات من Moyasar عند تغيير حالة الدفع
 * مهم للموثوقية في حالة فشل الـ callback العادي
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    // Step 1: Verify signature FIRST — reject unauthorized requests immediately
    const signature = request.headers.get('x-moyasar-signature');
    const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[WEBHOOK] ❌ MOYASAR_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
    }

    // استخدام timingSafeEqual لمنع هجمات التوقيت (timing attacks)
    const sigBuf = Buffer.from(signature ?? '')
    const expBuf = Buffer.from(webhookSecret)
    const signatureValid = sigBuf.length === expBuf.length &&
      timingSafeEqual(sigBuf, expBuf)

    if (!signature || !signatureValid) {
      console.error('[WEBHOOK] ❌ Invalid signature — rejected');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Step 2: Parse body only after signature passes
    const payload = await request.json();
    console.log('[WEBHOOK] ✅ Signature verified, processing:', payload.type);

    const supabase = await createServiceRoleClient();

    // Step 3: Log to webhook_logs
    try {
      await supabase.from('webhook_logs').insert({
        event_type: payload.type,
        payment_id: payload.data?.id,
        request_id: payload.data?.metadata?.request_id,
        raw_payload: payload,
        processed_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error('[WEBHOOK] ⚠️ Failed to log webhook:', logError);
    }

    // يدعم الصيغة القديمة والجديدة لأسماء أحداث ميسر.
    if ((payload.type === 'payment.paid' || payload.type === 'payment_paid') && payload.data) {
      const { id: paymentId, metadata } = payload.data;
      if (metadata?.resource_type === 'membership_topup' && metadata?.topup_id) {
        try {
          const { verifyAndApplyMembershipTopup } = await import('@/lib/membership-topup-payment');
          const result = await verifyAndApplyMembershipTopup(paymentId, metadata.topup_id);
          console.log('[WEBHOOK] Membership topup result:', result.reason);
        } catch (processError) {
          console.error('[WEBHOOK] Error processing membership topup:', processError);
        }
        return NextResponse.json({ received: true });
      }
      if (metadata?.resource_type === 'membership' && metadata?.membership_id) {
        try {
          const { verifyAndActivateMembership } = await import('@/lib/membership-payment');
          const result = await verifyAndActivateMembership(paymentId, metadata.membership_id);
          console.log('[WEBHOOK] Membership result:', result.reason);
        } catch (processError) {
          console.error('[WEBHOOK] Error processing membership payment:', processError);
        }
        return NextResponse.json({ received: true });
      }
      const requestId = metadata?.request_id;

      if (!requestId) {
        console.error('[WEBHOOK] ❌ Missing request_id in metadata');
        return NextResponse.json({ received: true }); // return 200 always
      }

      try {
        const { verifyAndUpdatePayment } = await import('@/lib/moyasar-server');
        const result = await verifyAndUpdatePayment(paymentId, requestId);
        console.log('[WEBHOOK] Result:', result.reason);

        // Update webhook log with result
        try {
          await supabase.from('webhook_logs').update({
            status: result.success ? 'success' : 'failed',
            response_message: result.reason
          }).eq('payment_id', paymentId);
        } catch {} // Ignore logging errors

      } catch (processError) {
        console.error('[WEBHOOK] ❌ Error processing payment:', processError);
      }
    } else if ((payload.type === 'payment.refunded' || payload.type === 'payment_refunded') && payload.data?.id) {
      try {
        const { completeProviderRefund } = await import('@/lib/refund-webhooks')
        const result = await completeProviderRefund({
          provider: 'moyasar', providerPaymentId: payload.data.id,
          providerRefundId: payload.data.refund_id ?? null, payload,
        })
        console.log('[WEBHOOK] Refund result:', result.reason)
      } catch (processError) {
        console.error('[WEBHOOK] Error processing refund:', processError)
      }
    } else {
      console.log('[WEBHOOK] ⚠️ Skipping non-payment event:', payload.type);
    }

    // Always return 200 — prevents Moyasar infinite retries
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('[WEBHOOK] 💥 Webhook error:', error);
    // Always return 200 to prevent infinite retries
    return NextResponse.json({ received: true });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Moyasar webhook endpoint is running',
    timestamp: new Date().toISOString()
  });
}
