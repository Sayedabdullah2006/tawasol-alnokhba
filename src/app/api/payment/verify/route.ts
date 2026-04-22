/**
 * Payment Verification API Route
 * Implements complete triple verification: status + amount + currency
 * Includes idempotency protection and proper order status updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthHeader, MOYASAR_API_URL, toSAR } from '@/lib/moyasar';
import { createServiceRoleClient } from '@/lib/supabase-server';
import type { MoyasarPayment } from '@/types/moyasar';

interface VerificationResult {
  success: boolean;
  payment?: Partial<MoyasarPayment>;
  error?: string;
  alreadyProcessed?: boolean;
}

async function verifyPaymentAndUpdateStatus(paymentId: string, requestId?: string): Promise<VerificationResult> {
  console.log(`[PAYMENT_VERIFY] 🚀 Starting verification for payment ID: ${paymentId}`);

  try {
    // Step 1: Check for idempotency - has this payment already been processed?
    const supabase = await createServiceRoleClient();

    const { data: existingPayment, error: checkError } = await supabase
      .from('publish_requests')
      .select('id, status, moyasar_payment_id, final_total')
      .eq('moyasar_payment_id', paymentId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[PAYMENT_VERIFY] ❌ Error checking for existing payment:', checkError);
      throw new Error('فشل في التحقق من حالة الدفع');
    }

    if (existingPayment) {
      console.log(`[PAYMENT_VERIFY] 🔄 Payment ${paymentId} already processed for request ${existingPayment.id}`);

      // Still fetch payment details to return consistent response
      const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': buildAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const payment: MoyasarPayment = await response.json();
        return {
          success: true,
          alreadyProcessed: true,
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
    }

    // Step 2: Call Moyasar API to verify payment
    console.log(`[PAYMENT_VERIFY] 📡 Calling Moyasar API for payment ${paymentId}`);

    const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': buildAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[PAYMENT_VERIFY] ❌ Moyasar API error: ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'فشل في التحقق من حالة الدفع من ميسر');
    }

    const payment: MoyasarPayment = await response.json();
    console.log(`[PAYMENT_VERIFY] 📄 Payment data received:`, {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      metadata: payment.metadata
    });

    // Step 3: Extract order ID from metadata
    const targetRequestId = requestId || payment.metadata?.request_id;
    console.log(`[PAYMENT_VERIFY] 🎯 Target request ID: ${targetRequestId} (source: ${requestId ? 'parameter' : 'metadata'})`);

    if (!targetRequestId) {
      console.error('[PAYMENT_VERIFY] ❌ No request ID found in metadata');
      throw new Error('معرف الطلب غير موجود في بيانات الدفع');
    }

    // Step 4: Get the original order to verify amount
    const { data: originalOrder, error: orderError } = await supabase
      .from('publish_requests')
      .select('id, status, final_total, admin_quoted_price')
      .eq('id', targetRequestId)
      .single();

    if (orderError || !originalOrder) {
      console.error('[PAYMENT_VERIFY] ❌ Order not found:', orderError);
      throw new Error('الطلب غير موجود في النظام');
    }

    const expectedAmountSAR = Number(originalOrder.final_total || originalOrder.admin_quoted_price || 0);
    const expectedAmountHalalas = Math.round(expectedAmountSAR * 100);

    console.log(`[PAYMENT_VERIFY] 💰 Amount verification: expected ${expectedAmountHalalas} halalas (${expectedAmountSAR} SAR), received ${payment.amount} halalas (${toSAR(payment.amount)} SAR)`);

    // Step 5: TRIPLE VERIFICATION (all three must pass)
    const statusValid = payment.status === 'paid';
    const amountValid = payment.amount === expectedAmountHalalas;
    const currencyValid = payment.currency === 'SAR';

    console.log(`[PAYMENT_VERIFY] 🔍 Triple verification:`, {
      status: `${payment.status} === 'paid' = ${statusValid}`,
      amount: `${payment.amount} === ${expectedAmountHalalas} = ${amountValid}`,
      currency: `${payment.currency} === 'SAR' = ${currencyValid}`
    });

    if (!statusValid) {
      console.warn(`[PAYMENT_VERIFY] ⚠️ Payment status is '${payment.status}', not 'paid'`);
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

    if (!amountValid) {
      console.error(`[PAYMENT_VERIFY] ❌ Amount mismatch: expected ${expectedAmountHalalas}, got ${payment.amount}`);
      throw new Error(`مبلغ الدفع غير متطابق: متوقع ${expectedAmountSAR} ر.س، تم استلام ${toSAR(payment.amount)} ر.س`);
    }

    if (!currencyValid) {
      console.error(`[PAYMENT_VERIFY] ❌ Currency mismatch: expected SAR, got ${payment.currency}`);
      throw new Error(`عملة الدفع غير صحيحة: متوقع SAR، تم استلام ${payment.currency}`);
    }

    // Step 6: All verifications passed - Update order status
    console.log(`[PAYMENT_VERIFY] ✅ All verifications passed! Updating request ${targetRequestId} status...`);

    const { data: updateData, error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status: 'in_progress', // التحضير - جاهز للبدء في العمل
        moyasar_payment_id: payment.id,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        moyasar_reference: (payment.source as any)?.reference_number || payment.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetRequestId)
      .eq('status', 'approved') // Safety: only update if still in 'approved' status
      .select();

    if (updateError) {
      console.error('[PAYMENT_VERIFY] ❌ Failed to update request status:', updateError);
      throw new Error('فشل في تحديث حالة الطلب في قاعدة البيانات');
    }

    if (!updateData || updateData.length === 0) {
      console.warn('[PAYMENT_VERIFY] ⚠️ No rows updated - order may already be processed or in different status');
      // This is not necessarily an error - the order might have already been updated
    } else {
      console.log(`[PAYMENT_VERIFY] ✅ Request ${targetRequestId} successfully updated to 'in_progress'`);
      console.log(`[PAYMENT_VERIFY] ✅ Rows affected: ${updateData.length}`);
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

  } catch (error) {
    console.error(`[PAYMENT_VERIFY] ❌ Verification failed for payment ${paymentId}:`, error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      console.error('[PAYMENT_VERIFY] ❌ GET request missing paymentId parameter');
      return NextResponse.json(
        {
          success: false,
          error: 'معرف الدفعة مطلوب',
        },
        { status: 400 }
      );
    }

    console.log('[PAYMENT_VERIFY] 📥 GET request for payment:', paymentId);
    const result = await verifyPaymentAndUpdateStatus(paymentId);
    console.log('[PAYMENT_VERIFY] 📤 GET response:', { success: result.success, alreadyProcessed: result.alreadyProcessed });

    return NextResponse.json(result);

  } catch (error) {
    console.error('[PAYMENT_VERIFY] ❌ GET Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'خطأ في الخادم أثناء التحقق من الدفع',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { paymentId, requestId } = await request.json();

    if (!paymentId) {
      console.error('[PAYMENT_VERIFY] ❌ POST request missing paymentId');
      return NextResponse.json(
        {
          success: false,
          error: 'معرف الدفعة مطلوب',
        },
        { status: 400 }
      );
    }

    console.log('[PAYMENT_VERIFY] 📥 POST request for payment:', paymentId, 'requestId:', requestId);
    const result = await verifyPaymentAndUpdateStatus(paymentId, requestId);
    console.log('[PAYMENT_VERIFY] 📤 POST response:', { success: result.success, alreadyProcessed: result.alreadyProcessed });

    return NextResponse.json(result);

  } catch (error) {
    console.error('[PAYMENT_VERIFY] ❌ POST Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'خطأ في الخادم أثناء التحقق من الدفع',
      },
      { status: 500 }
    );
  }
}