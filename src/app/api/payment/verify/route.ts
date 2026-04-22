/**
 * Payment Verification API Route
 * Verifies payment status with Moyasar API server-side
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthHeader, MOYASAR_API_URL } from '@/lib/moyasar';
import { createServiceRoleClient } from '@/lib/supabase-server';
import type { MoyasarPayment } from '@/types/moyasar';

async function verifyPaymentAndUpdateStatus(paymentId: string, requestId?: string) {
  // Call Moyasar API to verify payment
  const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      'Authorization': buildAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'فشل في التحقق من حالة الدفع');
  }

  const payment: MoyasarPayment = await response.json();
  console.log(`[PAYMENT_VERIFY] 🎉 Payment ${paymentId} status: ${payment.status}`);
  console.log(`[PAYMENT_VERIFY] 📄 Payment metadata:`, JSON.stringify(payment.metadata, null, 2));
  console.log(`[PAYMENT_VERIFY] 📄 Full payment object:`, JSON.stringify(payment, null, 2));

  // If payment is successful, update request status to in_progress (ready for work)
  if (payment.status === 'paid') {
    const targetRequestId = requestId || payment.metadata?.request_id;
    console.log(`[PAYMENT_VERIFY] 🎯 Target request ID: ${targetRequestId}`);
    console.log(`[PAYMENT_VERIFY] 🔧 Request ID source: ${requestId ? 'parameter' : 'metadata'}`);

    if (targetRequestId) {
      console.log(`[PAYMENT_VERIFY] 🔄 Updating request status to 'in_progress'...`);
      const supabase = await createServiceRoleClient();

      const { data: updateData, error: updateError } = await supabase
        .from('publish_requests')
        .update({
          status: 'in_progress', // التحضير - جاهز للبدء في العمل
          moyasar_payment_id: payment.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetRequestId)
        .select();

      if (updateError) {
        console.error('[PAYMENT_VERIFY] ❌ Failed to update request status:', updateError);
        console.error('[PAYMENT_VERIFY] ❌ Update error details:', updateError.message, updateError.details);
      } else {
        console.log(`[PAYMENT_VERIFY] ✅ Request ${targetRequestId} status updated to 'in_progress'`);
        console.log(`[PAYMENT_VERIFY] ✅ Update result:`, updateData);
      }
    } else {
      console.error('[PAYMENT_VERIFY] ❌ No request ID found - cannot update status');
      console.error('[PAYMENT_VERIFY] ❌ Payment metadata:', payment.metadata);
    }
  } else {
    console.warn(`[PAYMENT_VERIFY] ⚠️ Payment status is '${payment.status}', not 'paid' - skipping status update`);
  }

  return {
    success: true,
    payment: {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      created_at: payment.created_at,
      source: {
        type: payment.source.type,
        company: payment.source.company,
      },
      metadata: payment.metadata,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'معرف الدفعة مطلوب',
        },
        { status: 400 }
      );
    }

    console.log('[PAYMENT_VERIFY] GET request for payment:', paymentId);
    const result = await verifyPaymentAndUpdateStatus(paymentId);
    console.log('[PAYMENT_VERIFY] GET result:', result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[PAYMENT_VERIFY] GET Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'خطأ في الخادم أثناء التحقق من الدفع',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { paymentId, requestId } = await request.json();

    if (!paymentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'معرف الدفعة مطلوب',
        },
        { status: 400 }
      );
    }

    const result = await verifyPaymentAndUpdateStatus(paymentId, requestId);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[PAYMENT_VERIFY] POST Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'خطأ في الخادم أثناء التحقق من الدفع',
      },
      { status: 500 }
    );
  }
}