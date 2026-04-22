/**
 * Debug endpoint to check environment variables
 * Only works in development or with special header
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Security check - only allow with special header or in development
  const debugHeader = request.headers.get('x-debug-key');
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && debugHeader !== 'check-env-vars-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    // Check environment variables without exposing actual values
    const checks = {
      environment: process.env.NODE_ENV || 'unknown',
      site_url: {
        exists: !!process.env.NEXT_PUBLIC_SITE_URL,
        value: process.env.NEXT_PUBLIC_SITE_URL || 'missing'
      },
      moyasar_publishable: {
        exists: !!process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY,
        type: process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.startsWith('pk_live_') ? 'LIVE' :
              process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.startsWith('pk_test_') ? 'TEST' : 'INVALID'
      },
      moyasar_secret: {
        exists: process.env.NODE_ENV === 'production'
          ? !!process.env.MOYASAR_SECRET_KEY
          : !!process.env.MOYASAR_SECRET_KEY_Test,
        type: process.env.NODE_ENV === 'production'
          ? (process.env.MOYASAR_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' :
             process.env.MOYASAR_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' : 'INVALID')
          : (process.env.MOYASAR_SECRET_KEY_Test?.startsWith('sk_test_') ? 'TEST' : 'INVALID')
      },
      supabase: {
        url_exists: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        anon_key_exists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        service_key_exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      turnstile: {
        site_key_exists: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        secret_key_exists: !!process.env.TURNSTILE_SECRET_KEY
      },
      resend: {
        api_key_exists: !!process.env.RESEND_API_KEY
      }
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      checks,
      recommendations: [
        checks.moyasar_publishable.type !== 'LIVE' && process.env.NODE_ENV === 'production'
          ? 'UPDATE: Use LIVE Moyasar publishable key in production' : null,
        checks.moyasar_secret.type !== 'LIVE' && process.env.NODE_ENV === 'production'
          ? 'UPDATE: Use LIVE Moyasar secret key in production' : null,
        !checks.site_url.exists ? 'MISSING: NEXT_PUBLIC_SITE_URL required' : null,
        !checks.supabase.url_exists ? 'MISSING: NEXT_PUBLIC_SUPABASE_URL required' : null
      ].filter(Boolean)
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check environment variables',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}