/**
 * Debug endpoint for checking Moyasar payment details
 * Only works in development
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthHeader, MOYASAR_API_URL } from '@/lib/moyasar';

export async function GET(request: NextRequest) {
  // Only work in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: 'Payment ID required' }, { status: 400 });
    }

    console.log(`[DEBUG_MOYASAR] Fetching payment details for: ${paymentId}`);

    // Call Moyasar API to get payment details
    const response = await fetch(`${MOYASAR_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': buildAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    console.log(`[DEBUG_MOYASAR] Moyasar API response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[DEBUG_MOYASAR] Moyasar API error:`, errorData);

      return NextResponse.json({
        error: 'Moyasar API error',
        status: response.status,
        details: errorData
      }, { status: response.status });
    }

    const payment = await response.json();
    console.log(`[DEBUG_MOYASAR] Payment data:`, JSON.stringify(payment, null, 2));

    return NextResponse.json({
      success: true,
      payment,
      analysis: {
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        metadata: payment.metadata,
        hasRequestId: !!payment.metadata?.request_id,
        requestId: payment.metadata?.request_id,
        created_at: payment.created_at
      }
    });

  } catch (error) {
    console.error('[DEBUG_MOYASAR] Exception:', error);
    return NextResponse.json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}