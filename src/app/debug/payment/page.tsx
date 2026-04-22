'use client';

import { useState } from 'react';

export default function PaymentDebugPage() {
  const [requestId, setRequestId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testUpdate = async () => {
    if (!requestId.trim()) {
      alert('أدخل معرف الطلب');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/debug/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: requestId.trim() })
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: 'Network error', details: error });
    } finally {
      setLoading(false);
    }
  };

  if (process.env.NODE_ENV !== 'development') {
    return <div className="p-4">هذه الصفحة متاحة فقط في بيئة التطوير</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">اختبار تحديث حالة الدفع</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">معرف الطلب:</label>
          <input
            type="text"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="أدخل معرف الطلب (UUID)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <button
          onClick={testUpdate}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'جاري الاختبار...' : 'اختبار تحديث الحالة'}
        </button>
      </div>

      {result && (
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <h3 className="text-lg font-medium mb-2">النتيجة:</h3>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}