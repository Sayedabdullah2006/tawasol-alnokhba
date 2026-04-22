/**
 * Moyasar Payment Gateway Integration
 * Handles environment-specific keys and API helpers
 */

/**
 * Get the correct secret key based on environment
 * Uses test key in development, live key in production
 */
export function getSecretKey(): string {
  if (process.env.NODE_ENV === 'production') {
    return process.env.MOYASAR_SECRET_KEY!;
  }
  return process.env.MOYASAR_SECRET_KEY_Test!;
}

/**
 * Get the publishable key for frontend usage
 */
export function getPublishableKey(): string {
  return process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY!;
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
 * Disables Apple Pay in development until properly configured
 */
export function getPaymentMethods(): string[] {
  // Only enable credit card in development to avoid Apple Pay configuration issues
  if (process.env.NODE_ENV !== 'production') {
    return ['creditcard'];
  }

  // In production, enable both when Apple Pay is properly configured
  return ['creditcard', 'applepay'];
}