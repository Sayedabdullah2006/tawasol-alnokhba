/**
 * Moyasar Payment Gateway Integration
 * Handles environment-specific keys and API helpers
 */

/**
 * Get the correct secret key based on environment
 * Uses test key in development, live key in production
 */
export function getSecretKey(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const key = isProduction
    ? process.env.MOYASAR_SECRET_KEY
    : process.env.MOYASAR_SECRET_KEY_Test;

  if (!key) {
    const varName = isProduction ? 'MOYASAR_SECRET_KEY' : 'MOYASAR_SECRET_KEY_Test';
    throw new Error(`${varName} is not configured for ${process.env.NODE_ENV} environment`);
  }

  // Log key type for debugging (safely)
  const keyType = key.startsWith('sk_live_') ? 'LIVE' :
                 key.startsWith('sk_test_') ? 'TEST' : 'INVALID';
  console.log(`[MOYASAR] Using ${keyType} secret key for ${process.env.NODE_ENV}`);

  return key;
}

/**
 * Get the publishable key for frontend usage
 */
export function getPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error('NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY is not configured');
  }

  // Log key type for debugging (safely)
  const keyType = key.startsWith('pk_live_') ? 'LIVE' :
                 key.startsWith('pk_test_') ? 'TEST' : 'INVALID';
  console.log(`[MOYASAR] Using ${keyType} publishable key`);

  return key;
}

/**
 * Build HTTP Basic Auth header using the correct secret key
 */
export function buildAuthHeader(): string {
  const secretKey = getSecretKey();
  const credentials = Buffer.from(`${secretKey}:`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Convert SAR amount to halalas (Moyasar's smallest currency unit)
 * @param amountSAR Amount in Saudi Riyals
 * @returns Amount in halalas (SAR × 100)
 */
export function toHalalas(amountSAR: number): number {
  return Math.round(amountSAR * 100);
}

/**
 * Convert halalas back to SAR for display
 * @param halalas Amount in halalas
 * @returns Amount in SAR (halalas ÷ 100)
 */
export function toSAR(halalas: number): number {
  return halalas / 100;
}

/**
 * Moyasar API base URL
 */
export const MOYASAR_API_URL = 'https://api.moyasar.com/v1';

/**
 * Build callback URL for payment completion
 */
export function getCallbackUrl(): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/payment/callback`;
}

/**
 * Build webhook URL for Moyasar callbacks
 */
export function getWebhookUrl(): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/moyasar`;
}

/**
 * Get available payment methods based on environment
 * Disables Apple Pay until properly configured with merchant validation
 */
export function getPaymentMethods(): string[] {
  // البطاقة + Apple Pay. يتطلّب Apple Pay استضافة ملف ربط النطاق على
  // /.well-known/apple-developer-merchantid-domain-association وتفعيل النطاق
  // (nukhba.media) في لوحة Moyasar. يظهر زر Apple Pay فقط على أجهزة/متصفّحات Apple.
  return ['creditcard', 'applepay'];
}

