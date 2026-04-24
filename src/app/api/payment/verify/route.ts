/**
 * Payment Verification API Route
 * Now uses shared verifyAndUpdatePayment function from @/lib/moyasar
 * Supports both GET (for frontend callbacks) and POST (for webhooks/admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAndUpdatePayment } from '@/lib/moyasar-server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const paymentId = searchParams.get('paymentId') || id; // Support both parameter names
    const requestId = searchParams.get('requestId');

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

    console.log('[PAYMENT_VERIFY] 📥 GET request for payment:', paymentId, 'requestId:', requestId);
    const result = await verifyAndUpdatePayment(paymentId, requestId || undefined);
    console.log('[PAYMENT_VERIFY] 📤 GET response:', { success: result.success, reason: result.reason });

    // Convert the shared function result to match expected API format
    return NextResponse.json({
      success: result.success,
      payment: result.payment,
      error: result.success ? undefined : result.reason,
      alreadyProcessed: result.reason === 'already_processed'
    });

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
    const result = await verifyAndUpdatePayment(paymentId, requestId);
    console.log('[PAYMENT_VERIFY] 📤 POST response:', { success: result.success, reason: result.reason });

    // Convert the shared function result to match expected API format
    return NextResponse.json({
      success: result.success,
      payment: result.payment,
      error: result.success ? undefined : result.reason,
      alreadyProcessed: result.reason === 'already_processed'
    });

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