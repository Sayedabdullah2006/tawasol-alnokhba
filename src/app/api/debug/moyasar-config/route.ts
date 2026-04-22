/**
 * Moyasar Configuration Debug API
 * يساعد في التحقق من إعدادات Moyasar دون كشف المفاتيح السرية
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPublishableKey, getSecretKey } from '@/lib/moyasar';

export async function GET(request: NextRequest) {
  try {
    const config = {
      environment: process.env.NODE_ENV || 'development',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'NOT_SET',
      timestamp: new Date().toISOString(),
      variables: {
        publishableKey: {
          exists: !!process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY,
          type: process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.startsWith('pk_live_') ? 'LIVE' :
                process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.startsWith('pk_test_') ? 'TEST' :
                process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY ? 'INVALID' : 'MISSING',
          preview: process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.substring(0, 10) + '...',
          canLoad: false,
          error: ''
        },
        secretKey: {
          exists: !!process.env.MOYASAR_SECRET_KEY,
          type: process.env.MOYASAR_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' :
                process.env.MOYASAR_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' :
                process.env.MOYASAR_SECRET_KEY ? 'INVALID' : 'MISSING',
          canLoad: false,
          error: ''
        },
        testSecretKey: {
          exists: !!process.env.MOYASAR_SECRET_KEY_Test,
          type: process.env.MOYASAR_SECRET_KEY_Test?.startsWith('sk_test_') ? 'TEST' :
                process.env.MOYASAR_SECRET_KEY_Test ? 'INVALID' : 'MISSING'
        },
        webhookSecret: {
          exists: !!process.env.MOYASAR_WEBHOOK_SECRET,
          configured: !!process.env.MOYASAR_WEBHOOK_SECRET
        }
      },
      callbacks: {
        paymentCallback: `${process.env.NEXT_PUBLIC_SITE_URL}/payment/callback`,
        webhookUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/moyasar`
      }
    };

    // Test key loading
    try {
      const pubKey = getPublishableKey();
      config.variables.publishableKey.canLoad = true;
    } catch (error) {
      config.variables.publishableKey.canLoad = false;
      config.variables.publishableKey.error = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      const secKey = getSecretKey();
      config.variables.secretKey.canLoad = true;
    } catch (error) {
      config.variables.secretKey.canLoad = false;
      config.variables.secretKey.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Recommendations
    const recommendations = [];

    if (!config.variables.publishableKey.exists) {
      recommendations.push('❌ أضف NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY');
    } else if (config.variables.publishableKey.type === 'TEST' && config.environment === 'production') {
      recommendations.push('⚠️ تستخدم مفتاح اختبار في الإنتاج');
    }

    if (!config.variables.secretKey.exists) {
      recommendations.push('❌ أضف MOYASAR_SECRET_KEY');
    }

    if (!config.variables.testSecretKey.exists) {
      recommendations.push('⚠️ أضف MOYASAR_SECRET_KEY_Test للتطوير');
    }

    if (!config.siteUrl || config.siteUrl === 'NOT_SET') {
      recommendations.push('❌ أضف NEXT_PUBLIC_SITE_URL');
    } else if (!config.siteUrl.startsWith('https://')) {
      recommendations.push('⚠️ استخدم HTTPS في NEXT_PUBLIC_SITE_URL');
    }

    if (!config.variables.webhookSecret.exists) {
      recommendations.push('⚠️ أضف MOYASAR_WEBHOOK_SECRET لأمان الـ webhooks');
    }

    return NextResponse.json({
      status: 'success',
      config,
      recommendations,
      message: recommendations.length === 0 ?
        '✅ جميع الإعدادات تبدو صحيحة' :
        `⚠️ وُجدت ${recommendations.length} توصية للتحسين`
    });

  } catch (error) {
    console.error('[MOYASAR_DEBUG] Error:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'خطأ غير معروف',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}