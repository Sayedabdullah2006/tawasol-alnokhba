/**
 * Moyasar Webhook Handler
 * يستقبل إشعارات من Moyasar عند تغيير حالة الدفع
 * مهم للموثوقية في حالة فشل الـ callback العادي
 */

import { NextRequest, NextResponse } from 'next/server';
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

    if (!signature || signature !== webhookSecret) {
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

    // Step 4: Handle payment.paid
    if (payload.type === 'payment.paid' && payload.data) {
      const { id: paymentId, metadata } = payload.data;
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
