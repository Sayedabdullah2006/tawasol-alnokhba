/**
 * Moyasar Webhook Handler
 * Handles payment status updates from Moyasar
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import type { MoyasarPayment } from '@/types/moyasar';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const payment: MoyasarPayment = payload;

    // Log the webhook event
    console.log(`[MOYASAR_WEBHOOK] Received ${payment.status} for payment ${payment.id}`);

    // Handle different payment statuses
    switch (payment.status) {
      case 'paid':
        await handlePaymentSuccess(payment);
        break;

      case 'failed':
        await handlePaymentFailure(payment);
        break;

      case 'refunded':
      case 'partially_refunded':
        await handlePaymentRefund(payment);
        break;

      default:
        console.log(`[MOYASAR_WEBHOOK] Unhandled status: ${payment.status}`);
    }

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('[MOYASAR_WEBHOOK] Error processing webhook:', error);

    // Still return 200 to prevent Moyasar from retrying
    return NextResponse.json({
      received: true,
      error: 'Processing failed but acknowledged'
    });
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(payment: MoyasarPayment) {
  try {
    const supabase = await createServiceRoleClient();

    // Log successful payment
    console.log(`[PAYMENT_SUCCESS] Payment ${payment.id} completed successfully`);

    // TODO: Update request status in database
    // This would require linking the payment to a specific request
    // You can use payment.metadata to store request_id during payment creation

    if (payment.metadata?.request_id) {
      const { error } = await supabase
        .from('publish_requests')
        .update({
          status: 'paid',
          payment_id: payment.id,
          payment_amount: payment.amount / 100, // Convert from halalas to SAR
          payment_method: payment.source.type,
          paid_at: new Date().toISOString(),
        })
        .eq('id', payment.metadata.request_id);

      if (error) {
        console.error('[PAYMENT_SUCCESS] Database update error:', error);
      } else {
        console.log(`[PAYMENT_SUCCESS] Updated request ${payment.metadata.request_id} to paid status`);
      }
    }

    // TODO: Send payment confirmation email
    // You can integrate with your existing email system here

  } catch (error) {
    console.error('[PAYMENT_SUCCESS] Error:', error);
  }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailure(payment: MoyasarPayment) {
  try {
    console.log(`[PAYMENT_FAILURE] Payment ${payment.id} failed`);

    // TODO: Log failed payment attempt
    // You might want to track failed payments for analytics

    // TODO: Send failure notification if needed

  } catch (error) {
    console.error('[PAYMENT_FAILURE] Error:', error);
  }
}

/**
 * Handle payment refund
 */
async function handlePaymentRefund(payment: MoyasarPayment) {
  try {
    const supabase = await createServiceRoleClient();

    console.log(`[PAYMENT_REFUND] Payment ${payment.id} refunded: ${payment.refunded / 100} SAR`);

    // TODO: Update request status for refunds
    if (payment.metadata?.request_id) {
      const newStatus = payment.status === 'refunded' ? 'refunded' : 'partially_refunded';

      const { error } = await supabase
        .from('publish_requests')
        .update({
          status: newStatus,
          refunded_amount: payment.refunded / 100,
          refunded_at: new Date().toISOString(),
        })
        .eq('id', payment.metadata.request_id);

      if (error) {
        console.error('[PAYMENT_REFUND] Database update error:', error);
      }
    }

    // TODO: Send refund confirmation email

  } catch (error) {
    console.error('[PAYMENT_REFUND] Error:', error);
  }
}