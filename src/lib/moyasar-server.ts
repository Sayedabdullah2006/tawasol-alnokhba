/**
 * Server-Side Moyasar Payment Verification
 * This file contains server-only payment verification logic
 */

import { createServiceRoleClient } from '@/lib/supabase-server';
import { buildAuthHeader, MOYASAR_API_URL, toSAR } from '@/lib/moyasar';

/**
 * Shared Payment Verification and Status Update Function
 * This is the single source of truth for payment verification
 * Implements complete triple verification: status + amount + currency
 * Includes idempotency protection and proper order status updates
 */
export async function verifyAndUpdatePayment(paymentId: string, requestId?: string): Promise<{ success: boolean; reason?: string; payment?: any }> {
  const supabase = await createServiceRoleClient();

  console.log(`[MOYASAR_VERIFY] 🚀 Starting verification for payment ID: ${paymentId}`);

  try {
    // Step 1: Check for idempotency - has this payment already been processed?
    const { data: existingPayment, error: checkError } = await supabase
      .from('publish_requests')
      .select('id, status, moyasar_payment_id, final_total')
      .eq('moyasar_payment_id', paymentId)
      .maybeSingle(); // ← returns null safely when not found

    if (checkError) {
      console.error('[MOYASAR_VERIFY] ❌ Idempotency check failed:', checkError);
      return { success: false, reason: 'db_error_idempotency' };
    }

    if (existingPayment) {
      console.log(`[MOYASAR_VERIFY] 🔄 Payment ${paymentId} already processed for request ${existingPayment.id}`);

      // Fetch payment details from Moyasar to return consistent response
      const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': buildAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const payment = await response.json();
        return {
          success: true,
          reason: 'already_processed',
          payment: {
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            description: payment.description,
            created_at: payment.created_at,
            source: {
              type: payment.source?.type,
              company: payment.source?.company,
              last4: payment.source?.number?.slice(-4) ?? '****',
            },
            metadata: payment.metadata,
          },
        };
      }
    }

    // Step 2: Call Moyasar API to verify payment
    console.log(`[MOYASAR_VERIFY] 📡 Calling Moyasar API for payment ${paymentId}`);

    const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': buildAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[MOYASAR_VERIFY] ❌ Moyasar API error: ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({}));
      return { success: false, reason: (errorData as any).message || 'فشل في التحقق من حالة الدفع من ميسر' };
    }

    const payment = await response.json();
    console.log(`[MOYASAR_VERIFY] 📄 Payment data received:`, {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      metadata: payment.metadata
    });

    // Step 3: Extract order ID from metadata
    const targetRequestId = requestId || payment.metadata?.request_id;
    console.log(`[MOYASAR_VERIFY] 🎯 Target request ID: ${targetRequestId} (source: ${requestId ? 'parameter' : 'metadata'})`);

    if (!targetRequestId) {
      console.error('[MOYASAR_VERIFY] ❌ No request ID found in metadata');
      return { success: false, reason: 'معرف الطلب غير موجود في بيانات الدفع' };
    }

    // Step 4: Get the original order to verify amount
    const { data: originalOrder, error: orderError } = await supabase
      .from('publish_requests')
      .select('id, status, final_total, admin_quoted_price')
      .eq('id', targetRequestId)
      .single();

    if (orderError || !originalOrder) {
      console.error('[MOYASAR_VERIFY] ❌ Order not found:', orderError);
      return { success: false, reason: 'الطلب غير موجود في النظام' };
    }

    const expectedAmountSAR = Number(originalOrder.final_total || originalOrder.admin_quoted_price || 0);
    const expectedAmountHalalas = Math.round(expectedAmountSAR * 100);

    console.log(`[MOYASAR_VERIFY] 💰 Amount verification: expected ${expectedAmountHalalas} halalas (${expectedAmountSAR} SAR), received ${payment.amount} halalas (${toSAR(payment.amount)} SAR)`);

    // Step 5: TRIPLE VERIFICATION (all three must pass)
    const statusValid = payment.status === 'paid';
    const amountValid = payment.amount === expectedAmountHalalas;
    const currencyValid = payment.currency === 'SAR';

    console.log(`[MOYASAR_VERIFY] 🔍 Triple verification:`, {
      status: `${payment.status} === 'paid' = ${statusValid}`,
      amount: `${payment.amount} === ${expectedAmountHalalas} = ${amountValid}`,
      currency: `${payment.currency} === 'SAR' = ${currencyValid}`
    });

    if (!statusValid) {
      console.warn(`[MOYASAR_VERIFY] ⚠️ Payment status is '${payment.status}', not 'paid'`);
      return {
        success: true,
        reason: 'payment_not_paid',
        payment: {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description,
          created_at: payment.created_at,
          source: {
            type: payment.source?.type,
            company: payment.source?.company,
            last4: payment.source?.number?.slice(-4) ?? '****',
          },
          metadata: payment.metadata,
        },
      };
    }

    if (!amountValid) {
      console.error(`[MOYASAR_VERIFY] ❌ Amount mismatch: expected ${expectedAmountHalalas}, got ${payment.amount}`);
      return { success: false, reason: `مبلغ الدفع غير متطابق: متوقع ${expectedAmountSAR} ر.س، تم استلام ${toSAR(payment.amount)} ر.س` };
    }

    if (!currencyValid) {
      console.error(`[MOYASAR_VERIFY] ❌ Currency mismatch: expected SAR, got ${payment.currency}`);
      return { success: false, reason: `عملة الدفع غير صحيحة: متوقع SAR، تم استلام ${payment.currency}` };
    }

    // Step 6: All verifications passed - Update order status
    console.log(`[MOYASAR_VERIFY] ✅ All verifications passed! Updating request ${targetRequestId} status...`);

    const { data: updateData, error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status: 'in_progress', // التحضير - جاهز للبدء في العمل
        moyasar_payment_id: payment.id,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        moyasar_reference: payment.source?.reference_number ?? null,
        moyasar_auth_code: payment.source?.authorization_code ?? null,
        payment_method: `${payment.source?.company?.toUpperCase() ?? 'CARD'} ***${payment.source?.number?.slice(-4) ?? '****'}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetRequestId)
      .eq('status', 'approved') // Safety: only update if still in 'approved' status
      .select();

    if (updateError) {
      console.error('[MOYASAR_VERIFY] ❌ Failed to update request status:', updateError);
      return { success: false, reason: 'فشل في تحديث حالة الطلب في قاعدة البيانات' };
    }

    if (!updateData || updateData.length === 0) {
      console.warn('[MOYASAR_VERIFY] ⚠️ No rows updated - order may already be processed or in different status');
      // This is not necessarily an error - the order might have already been updated
    } else {
      console.log(`[MOYASAR_VERIFY] ✅ Request ${targetRequestId} successfully updated to 'in_progress'`);
      console.log(`[MOYASAR_VERIFY] ✅ Rows affected: ${updateData.length}`);
    }

    return {
      success: true,
      reason: 'verified_and_updated',
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        created_at: payment.created_at,
        source: {
          type: payment.source?.type,
          company: payment.source?.company,
          last4: payment.source?.number?.slice(-4) ?? '****',  // ← renamed for clarity
        },
        metadata: payment.metadata,
      },
    };

  } catch (error) {
    console.error(`[MOYASAR_VERIFY] ❌ Verification failed for payment ${paymentId}:`, error);
    return { success: false, reason: error instanceof Error ? error.message : 'خطأ غير معروف' };
  }
}