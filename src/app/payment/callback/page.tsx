/**
 * Payment Callback Page
 * Handles payment completion from Moyasar and verifies server-side
 */

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import { formatNumber } from '@/lib/utils';
import { toSAR } from '@/lib/moyasar';
import type { MoyasarPayment } from '@/types/moyasar';

interface PaymentResult {
  success: boolean;
  payment?: MoyasarPayment;
  error?: string;
}

export default function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Extract payment details from URL params
  const paymentId = searchParams.get('id');
  const status = searchParams.get('status');
  const message = searchParams.get('message');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!paymentId) {
        setResult({
          success: false,
          error: 'معرف الدفعة غير موجود',
        });
        setLoading(false);
        return;
      }

      try {
        console.log('🔍 [CALLBACK] Starting payment verification for ID:', paymentId);

        // Verify payment server-side using POST to trigger status update
        console.log('📤 [CALLBACK] Sending POST request to /api/payment/verify');
        const response = await fetch(`/api/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId })
        });
        console.log('📡 [CALLBACK] Verification response status:', response.status);
        console.log('📡 [CALLBACK] Verification response headers:', response.headers);

        const data = await response.json();
        console.log('📡 [CALLBACK] Verification response data:', JSON.stringify(data, null, 2));

        if (response.ok && data.success) {
          console.log('✅ [CALLBACK] Payment verification successful');

          // اختبار تحديث مباشر إضافي في حالة فشل التحديث التلقائي
          if (data.payment?.metadata?.request_id) {
            console.log('🔧 [CALLBACK] Testing direct update as backup...');
            try {
              const directResponse = await fetch('/api/debug/direct-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: data.payment.metadata.request_id })
              });
              const directData = await directResponse.json();
              console.log('🔧 [CALLBACK] Direct update result:', directData);
            } catch (error) {
              console.error('🔧 [CALLBACK] Direct update failed:', error);
            }
          }

          setResult({
            success: true,
            payment: data.payment,
          });
        } else {
          console.error('❌ [CALLBACK] Payment verification failed:', data);
          setResult({
            success: false,
            error: data.error || 'فشل في التحقق من حالة الدفع',
          });
        }
      } catch (error) {
        console.error('❌ [CALLBACK] Payment verification error:', error);
        setResult({
          success: false,
          error: 'خطأ في الاتصال بالخادم',
        });
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [paymentId]);

  // Loading state
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <LoadingSpinner size="lg" />
          <p className="text-muted mt-4">جارٍ التحقق من حالة الدفع...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (result?.success && result.payment && result.payment.status === 'paid') {
    const payment = result.payment;
    const amount = toSAR(payment.amount);

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Success header */}
          <div className="bg-green/5 border-b border-green/20 p-6 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-black text-green mb-2">تم الدفع بنجاح!</h1>
            <p className="text-sm text-muted">تم استلام دفعتك وتأكيدها بنجاح</p>
          </div>

          {/* Payment details */}
          <div className="p-6 space-y-4">
            <div className="bg-cream rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted text-sm">رقم المعاملة:</span>
                <span className="font-mono text-sm">{payment.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">المبلغ المدفوع:</span>
                <span className="font-bold text-green text-lg">{formatNumber(amount)} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">وسيلة الدفع:</span>
                <span className="font-medium capitalize">
                  {payment.source.type === 'creditcard' && '💳 بطاقة ائتمانية'}
                  {payment.source.type === 'applepay' && '🍎 Apple Pay'}
                  {payment.source.company && ` (${payment.source.company})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">تاريخ الدفع:</span>
                <span className="text-sm">
                  {new Date(payment.created_at).toLocaleString('ar-SA')}
                </span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">🚀</div>
              <p className="font-bold text-blue-700 text-sm mb-1">ماذا بعد؟</p>
              <p className="text-xs text-blue-600">
                سيتم البدء في تجهيز طلبك فوراً. ستتلقى تحديثات عبر البريد الإلكتروني.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button onClick={() => router.push('/dashboard')} className="w-full">
                عرض طلباتي
              </Button>
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="w-full"
              >
                طباعة الإيصال
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Failed state
  if (result?.success === false || status === 'failed') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Error header */}
          <div className="bg-red-50 border-b border-red-200 p-6 text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-black text-red-700 mb-2">فشل في إتمام الدفع</h1>
            <p className="text-sm text-red-600">
              {result?.error || message || 'حدث خطأ أثناء معالجة الدفع'}
            </p>
          </div>

          {/* Error details */}
          <div className="p-6 space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">💡</div>
              <p className="font-bold text-yellow-700 text-sm mb-2">نصائح لحل المشكلة:</p>
              <ul className="text-xs text-yellow-600 space-y-1 text-right">
                <li>• تأكد من صحة بيانات البطاقة</li>
                <li>• تأكد من وجود رصيد كافٍ</li>
                <li>• تأكد من تفعيل الشراء عبر الإنترنت</li>
                <li>• جرب طريقة دفع أخرى</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                onClick={() => router.back()}
                className="w-full"
              >
                إعادة المحاولة
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/dashboard')}
                className="w-full"
              >
                العودة للطلبات
              </Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-muted">
                تحتاج مساعدة؟{' '}
                <Link href="/contact" className="text-green hover:underline">
                  تواصل معنا
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pending/Initiated state
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {/* Pending header */}
        <div className="bg-yellow-50 border-b border-yellow-200 p-6 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-black text-yellow-700 mb-2">الدفع قيد المعالجة</h1>
          <p className="text-sm text-yellow-600">
            دفعتك قيد المراجعة، ستتلقى تأكيداً خلال دقائق
          </p>
        </div>

        {/* Pending details */}
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">🔄</div>
            <p className="font-bold text-blue-700 text-sm mb-2">ماذا الآن؟</p>
            <p className="text-xs text-blue-600">
              ستتلقى إشعاراً عبر البريد الإلكتروني عند تأكيد الدفع.
              يمكنك متابعة حالة طلبك من لوحة التحكم.
            </p>
          </div>

          <Button
            onClick={() => router.push('/dashboard')}
            className="w-full"
          >
            متابعة حالة الطلب
          </Button>
        </div>
      </div>
    </div>
  );
}