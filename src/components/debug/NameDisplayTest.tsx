/**
 * مكوّن تجريبي لاختبار عرض الأسماء
 * يمكن إضافته مؤقتاً لمقارنة النتائج
 */

'use client'

import ClientNameFixed from '@/components/ui/ClientNameFixed'
import { fixTextDirection } from '@/lib/text-utils'

interface NameDisplayTestProps {
  names: string[]
}

export default function NameDisplayTest({ names }: NameDisplayTestProps) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
      <h3 className="font-bold text-yellow-700 mb-3">🧪 اختبار عرض الأسماء</h3>

      <div className="space-y-3">
        {names.map((name, index) => (
          <div key={index} className="bg-white rounded-lg p-3 border">
            <div className="text-xs text-gray-500 mb-2">العينة {index + 1}:</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {/* النص الأصلي */}
              <div>
                <div className="text-xs text-red-600 mb-1">الأصلي (قد يكون معكوس):</div>
                <div className="p-2 bg-red-50 rounded font-mono">{name}</div>
              </div>

              {/* بعد المعالجة النصية فقط */}
              <div>
                <div className="text-xs text-blue-600 mb-1">بعد معالجة النص:</div>
                <div className="p-2 bg-blue-50 rounded">{fixTextDirection(name)}</div>
              </div>

              {/* بعد التصحيح الكامل */}
              <div>
                <div className="text-xs text-green-600 mb-1">مع التصحيح الكامل:</div>
                <div className="p-2 bg-green-50 rounded">
                  <ClientNameFixed name={name} className="font-medium" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-yellow-600 mt-3">
        💡 قارن بين الثلاث أعمدة لرؤية تأثير كل خطوة تصحيح
      </div>
    </div>
  )
}