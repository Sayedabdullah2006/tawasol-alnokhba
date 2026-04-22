/**
 * Custom hook for Moyasar.js integration
 * Handles script loading and payment initialization
 */

import { useState, useEffect, useCallback } from 'react';
import { getPublishableKey, toHalalas, getCallbackUrl } from '@/lib/moyasar';
import type { MoyasarConfig, MoyasarPayment } from '@/types/moyasar';

interface UseMoyasarReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  initPayment: (
    amount: number,
    description: string,
    metadata?: Record<string, any>
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
      metadata?: Record<string, any>
    ): Promise<void> => {
      if (!isLoaded || !window.Moyasar) {
        throw new Error('مكتبة الدفع الإلكتروني غير محملة بعد');
      }

      try {
        const config: MoyasarConfig = {
          element: '#moyasar-form',
          amount: toHalalas(amount), // Convert SAR to halalas
          currency: 'SAR',
          description,
          publishable_api_key: getPublishableKey(),
          callback_url: getCallbackUrl(),
          methods: ['creditcard', 'applepay'],
          apple_pay: {
            label: 'nukhba.media',
          },
          metadata,
          on_completed: (payment: MoyasarPayment) => {
            console.log('Payment completed:', payment);
            // Redirect will be handled by callback_url
          },
          on_failed: (error: any) => {
            console.error('Payment failed:', error);
            // Error handling will be done in the component
          },
        };

        window.Moyasar.init(config);
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