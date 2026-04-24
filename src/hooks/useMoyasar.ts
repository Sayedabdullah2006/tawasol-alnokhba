/**
 * Custom hook for Moyasar.js integration
 * Handles script loading and payment initialization
 */

import { useState, useEffect, useCallback } from 'react';
import { getPublishableKey, toHalalas, getCallbackUrl, getPaymentMethods } from '@/lib/moyasar';
import type { MoyasarConfig, MoyasarPayment } from '@/types/moyasar';

interface UseMoyasarReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  initPayment: (
    amount: number,
    description: string,
    metadata?: Record<string, any>,
    elementRef?: HTMLElement
  ) => Promise<void>;
}

export function useMoyasar(): UseMoyasarReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if Moyasar is already loaded
    if (window.Moyasar) {
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="moyasar.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        setIsLoaded(true);
        setIsLoading(false);
      });
      existingScript.addEventListener('error', () => {
        setError('فشل في تحميل مكتبة الدفع الإلكتروني');
        setIsLoading(false);
      });
      return;
    }

    // Load Moyasar.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.js';
    script.async = true;

    script.onload = () => {
      setIsLoaded(true);
      setIsLoading(false);
    };

    script.onerror = () => {
      setError('فشل في تحميل مكتبة الدفع الإلكتروني');
      setIsLoading(false);
    };

    document.head.appendChild(script);

    // Load Moyasar CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.css';
    document.head.appendChild(cssLink);

    // Cleanup
    return () => {
      const scriptToRemove = document.querySelector('script[src*="moyasar.js"]');
      const cssToRemove = document.querySelector('link[href*="moyasar.css"]');
      if (scriptToRemove) document.head.removeChild(scriptToRemove);
      if (cssToRemove) document.head.removeChild(cssToRemove);
    };
  }, []);

  /**
   * Initialize Moyasar payment form
   * @param amount Payment amount in SAR
   * @param description Payment description
   * @param metadata Additional metadata
   */
  const initPayment = useCallback(
    async (
      amount: number,
      description: string,
      metadata?: Record<string, any>,
      elementRef?: HTMLElement
    ): Promise<void> => {
      if (!isLoaded || !window.Moyasar) {
        throw new Error('مكتبة الدفع الإلكتروني غير محملة بعد');
      }

      try {
        // استخدام العنصر المُمرر مباشرة أو البحث عنه
        let element: HTMLElement | null = elementRef || document.getElementById('moyasar-form');

        if (!element) {
          console.error('Moyasar form element not found in DOM');
          throw new Error('عنصر نموذج الدفع غير موجود في الصفحة');
        }

        console.log('Initializing Moyasar with element:', element);
        console.log('Element is connected to DOM:', element.isConnected);
        console.log('Element parent:', element.parentElement);

        const publishableKey = getPublishableKey();
        const callbackUrl = getCallbackUrl();
        console.log('Moyasar publishable key:', publishableKey);
        console.log('Moyasar callback URL:', callbackUrl);
        console.log('Payment metadata:', metadata);

        const paymentMethods = getPaymentMethods();

        // ✅ Define config object first to avoid circular references
        const paymentConfig: MoyasarConfig = {
          element: element,
          amount: toHalalas(amount),
          currency: 'SAR',
          description,
          publishable_api_key: getPublishableKey(),
          callback_url: getCallbackUrl(),
          methods: paymentMethods as ('creditcard' | 'applepay')[],
          ...(paymentMethods.includes('applepay') && {
            apple_pay: {
              label: 'nukhba.media',
            },
          }),
          metadata,
          on_completed: (payment: MoyasarPayment) => {
            console.log('🎉 Payment completed:', payment);
            console.log('🔍 Payment status:', payment.status);
            console.log('🆔 Request ID from metadata:', payment.metadata?.request_id);

            // Fire-and-forget verify call, then redirect immediately
            if (payment.status === 'paid' && payment.metadata?.request_id) {
              console.log('✅ Payment successful, firing verify and redirecting...');

              fetch(`/api/payment/verify?id=${payment.id}&requestId=${payment.metadata.request_id}`, {
                method: 'GET'
              }).catch(error => {
                console.error('[Moyasar] on_completed verify error:', error);
              });

              window.location.href = `/payment/callback?id=${payment.id}&requestId=${payment.metadata.request_id}`;
            } else {
              console.warn('⚠️ Payment not paid or missing request_id');
              console.log('⚠️ Payment status:', payment.status);
              console.log('⚠️ Request ID:', payment.metadata?.request_id);
              window.location.href = `/payment/callback?id=${payment.id}&requestId=${payment.metadata?.request_id || ''}`;
            }
          },
          on_failed: (error: any) => {
            console.error('[Moyasar] ❌ Payment failed:', error);
            // ✅ Use paymentConfig directly — it IS defined before Moyasar.init is called
            const reqId = paymentConfig.metadata?.request_id ?? '';
            const paymentId = error?.id ?? '';
            window.location.href = `/payment/callback?id=${paymentId}&requestId=${reqId}&failed=true`;
          },
        };

        console.log('Moyasar config:', paymentConfig);
        window.Moyasar.init(paymentConfig);
        console.log('Moyasar initialized successfully');
      } catch (err) {
        console.error('Error initializing Moyasar:', err);
        throw new Error('فشل في تهيئة نموذج الدفع');
      }
    },
    [isLoaded]
  );

  return {
    isLoaded,
    isLoading,
    error,
    initPayment,
  };
}