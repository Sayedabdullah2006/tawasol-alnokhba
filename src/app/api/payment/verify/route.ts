/**
 * Payment Verification API Route
 * Verifies payment status with Moyasar API server-side
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthHeader, MOYASAR_API_URL } from '@/lib/moyasar';
import type { MoyasarPayment } from '@/types/moyasar';

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

      return NextResponse.json(
        {
          success: false,
          error: errorData.message || 'فشل في التحقق من حالة الدفع',
        },
        { status: response.status }
      );
    }

    const payment: MoyasarPayment = await response.json();

    // Log the payment verification for monitoring
    console.log(`[PAYMENT_VERIFY] Payment ${paymentId} status: ${payment.status}`);

    return NextResponse.json({
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
    });

  } catch (error) {
    console.error('[PAYMENT_VERIFY] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'خطأ في الخادم أثناء التحقق من الدفع',
      },
      { status: 500 }
    );
  }
}