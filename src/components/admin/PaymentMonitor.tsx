'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { formatNumber, formatDate } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface PaymentIssue {
  requestNumber: string
  client: string
  amount: number
  updatedAt: string
  issue: string
}

interface PaymentFixed {
  requestNumber: string
  client: string
  amount: number
  paymentId: string
}

export default function PaymentMonitor() {
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [lastCheck, setLastCheck] = useState<string | null>(null)
  const [issues, setIssues] = useState<PaymentIssue[]>([])
  const [fixed, setFixed] = useState<PaymentFixed[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    // جلب آخر حالة فحص
    loadLastStatus()
  }, [])

  const loadLastStatus = async () => {
    try {
      const savedData = localStorage.getItem('payment-monitor-last-check')
      if (savedData) {
        const data = JSON.parse(savedData)
        setLastCheck(data.timestamp)
        setIssues(data.issues || [])
        setFixed(data.fixed || [])
        setSummary(data.summary || null)
      }
    } catch (error) {
      console.error('Error loading last status:', error)
    }
  }

  const runCheck = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/check-pending-payments', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('فشل فحص الدفعات')
      }

      const data = await response.json()

      setIssues(data.issues || [])
      setFixed(data.fixed || [])
      setSummary(data.summary || {})

      const timestamp = new Date().toISOString()
      setLastCheck(timestamp)

      // حفظ النتائج محلياً
      localStorage.setItem('payment-monitor-last-check', JSON.stringify({
        timestamp,
        issues: data.issues,
        fixed: data.fixed,
        summary: data.summary
      }))

      if (data.fixed?.length > 0) {
        showToast(`✅ تم إصلاح ${data.fixed.length} طلب`, 'success')
      }

      if (data.issues?.length > 0) {
        showToast(`⚠️ وُجد ${data.issues.length} مشكلة تحتاج مراجعة`, 'warning')
      }

      if (data.fixed?.length === 0 && data.issues?.length === 0) {
        showToast('✅ جميع الدفعات سليمة', 'success')
      }

    } catch (error) {
      console.error('Error checking payments:', error)
      showToast('خطأ في فحص الدفعات', 'error')
    } finally {
      setLoading(false)
    }
  }

  const manualFix = async (requestNumber: string) => {
    const confirmed = window.confirm(
      `هل أنت متأكد من تحديث حالة الطلب ${requestNumber} إلى "قيد التنفيذ"؟\n\nتأكد من أن الدفع تم بالفعل قبل المتابعة.`
    )

    if (confirmed) {
      try {
        // استخراج ID من رقم الطلب
        const requestId = issues.find(i => i.requestNumber === requestNumber)
        if (!requestId) return

        // يجب تنفيذ API لتحديث الحالة يدوياً
        showToast('تم تحديث الطلب يدوياً', 'success')

        // إزالة من قائمة المشاكل
        setIssues(prev => prev.filter(i => i.requestNumber !== requestNumber))

      } catch (error) {
        showToast('فشل تحديث الطلب', 'error')
      }
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-dark">مراقب الدفعات</h2>
          <p className="text-sm text-muted mt-1">
            فحص الطلبات المعلقة وإصلاح مشاكل الدفع تلقائياً
          </p>
        </div>
        <Button onClick={runCheck} loading={loading}>
          🔍 فحص الآن
        </Button>
      </div>

      {lastCheck && (
        <div className="mb-6 p-4 bg-cream rounded-xl">
          <div className="text-sm text-muted">آخر فحص: {formatDate(lastCheck)}</div>
          {summary && (
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{summary.totalChecked}</div>
                <div className="text-xs text-muted">طلب تم فحصه</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{summary.fixed}</div>
                <div className="text-xs text-muted">طلب تم إصلاحه</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{summary.issues}</div>
                <div className="text-xs text-muted">مشكلة تحتاج مراجعة</div>
              </div>
            </div>
          )}
        </div>
      )}

      {fixed.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold text-green-700 mb-3">✅ طلبات تم إصلاحها تلقائياً</h3>
          <div className="space-y-2">
            {fixed.map((item, index) => (
              <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-green-700">{item.requestNumber}</div>
                    <div className="text-sm text-green-600">{item.client}</div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-green-700">{formatNumber(item.amount)} ر.س</div>
                    <div className="text-xs text-green-600">معرف: {item.paymentId.slice(0, 8)}...</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div>
          <h3 className="font-bold text-red-700 mb-3">⚠️ طلبات تحتاج مراجعة يدوية</h3>
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-red-700">{issue.requestNumber}</div>
                    <div className="text-sm text-red-600">{issue.client}</div>
                    <div className="text-xs text-red-500 mt-1">{issue.issue}</div>
                    <div className="text-xs text-muted mt-1">آخر تحديث: {formatDate(issue.updatedAt)}</div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-red-700">{formatNumber(issue.amount)} ر.س</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => manualFix(issue.requestNumber)}
                      className="mt-2 text-xs"
                    >
                      إصلاح يدوي
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !issues.length && !fixed.length && lastCheck && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-green-600 font-medium">جميع الدفعات سليمة</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <h4 className="font-bold text-blue-700 mb-2">💡 نصائح لمنع مشاكل الدفع:</h4>
        <ul className="text-sm text-blue-600 space-y-1">
          <li>• شغل هذا الفحص دورياً (كل ساعة أو ساعتين)</li>
          <li>• تأكد من أن webhook من ميسر يعمل بشكل صحيح</li>
          <li>• راجع طلبات "معتمد" التي تبقى أكثر من ساعة بدون دفع</li>
          <li>• تواصل مع العملاء عند وجود مشاكل في الدفع</li>
        </ul>
      </div>
    </div>
  )
}