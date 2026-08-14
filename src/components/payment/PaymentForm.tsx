/**
 * Moyasar Payment Form Component
 * Provides Arabic-first UI for credit card and Apple Pay payments
 */

'use client';

import { useEffect, useRef } from 'react';
import { useMoyasar } from '@/hooks/useMoyasar';
import { getPaymentMethods } from '@/lib/moyasar';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { PaymentMetadata } from '@/types/moyasar';

interface PaymentFormProps {
  /** Payment amount in SAR */
  amount: number;
  /** Payment description */
  description: string;
  /** Additional metadata to include with payment */
  metadata?: PaymentMetadata;
  /** CSS classes to apply to container */
  className?: string;
}

export default function PaymentForm({
  amount,
  description,
  metadata,
  className = '',
}: PaymentFormProps) {
  const { isLoaded, isLoading, error, initPayment } = useMoyasar();
  // نتذكّر المبلغ الذي هُيِّئ به الفورم — فلا نُعيد بناءه إلا إذا تغيّر المبلغ فعلاً
  // (مثل تطبيق خصم)، وليس عند كل إعادة عرض أو تبديل وسيلة الدفع.
  const initedAmountRef = useRef<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded || amount <= 0 || !formRef.current) return;
    if (initedAmountRef.current === amount) return; // مُهيّأ بالفعل لهذا المبلغ
    initedAmountRef.current = amount;

    const el = formRef.current;
    el.innerHTML = ''; // تنظيف أي محتوى سابق

    // تأخير قصير لضمان تحديث DOM قبل تهيئة Moyasar
    const timer = setTimeout(() => {
      initPayment(amount, description, metadata, el).catch((err) => {
        console.error('Failed to initialize payment:', err);
        initedAmountRef.current = null; // السماح بإعادة المحاولة
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [isLoaded, amount, description, metadata, initPayment]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-card rounded-xl border border-border p-6 text-center ${className}`}>
        <LoadingSpinner size="md" />
        <p className="text-sm text-muted mt-3">جارٍ تحميل نموذج الدفع الآمن...</p>
        <p className="text-xs text-muted mt-1">مدعوم بتقنية Moyasar 🔒</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-xl p-6 text-center ${className}`}>
        <div className="text-3xl mb-2">⚠️</div>
        <p className="font-bold text-red-700 text-sm mb-1">خطأ في تحميل نموذج الدفع</p>
        <p className="text-xs text-red-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-sm text-red-600 hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // Payment form
  return (
    <div className={`bg-card rounded-xl border border-border overflow-hidden ${className}`}>
      {/* Payment Methods Info */}
      <div className="p-4 bg-cream/50 border-b border-border">
        <div className="flex items-center justify-center gap-4 text-xs text-muted">
          <div className="flex items-center gap-1">
            <span>💳</span>
            <span>مدى وفيزا</span>
          </div>
          {getPaymentMethods().includes('applepay') && (
            <div className="flex items-center gap-1">
              <span>🍎</span>
              <span>Apple Pay</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span>🔐</span>
            <span>SSL مشفر</span>
          </div>
        </div>
      </div>

      {/* Moyasar Payment Form Container */}
      <div className="p-5">
        <div id="moyasar-form" ref={formRef}></div>

        {/* Payment info */}
        <div className="mt-4 p-3 bg-cream rounded-lg">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted">المبلغ المستحق:</span>
            <span className="font-bold text-gold">{amount.toFixed(2)} ر.س</span>
          </div>
          <p className="text-xs text-muted mt-2">{description}</p>
        </div>

      </div>
    </div>
  );
}
