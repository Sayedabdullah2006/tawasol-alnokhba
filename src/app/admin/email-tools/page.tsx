'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface TestResult {
  success: boolean
  validation?: {
    score: number
    warnings: string[]
    isSpammy: boolean
  }
  error?: string
  testDetails?: any
}

export default function EmailToolsPage() {
  const [loading, setLoading] = useState(false)
  const [testEmail, setTestEmail] = useState('first1saudi@gmail.com')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [contentValidation, setContentValidation] = useState<any>(null)
  const [bestPractices, setBestPractices] = useState<any>(null)

  const supabase = createClient()

  const callEmailAPI = async (action: string, params: any = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('غير مصرح')
    }

    const response = await fetch('/api/admin/email-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action, ...params })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'خطأ في الاتصال')
    }

    return response.json()
  }

  const handleTestSend = async (testType: 'basic' | 'template' | 'custom') => {
    setLoading(true)
    setTestResult(null)

    try {
      const result = await callEmailAPI('test-send', {
        to: testEmail,
        testType
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'خطأ غير معروف'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleValidateContent = async () => {
    const subject = (document.getElementById('test-subject') as HTMLInputElement)?.value || ''
    const html = (document.getElementById('test-html') as HTMLTextAreaElement)?.value || ''

    if (!subject || !html) {
      alert('يرجى إدخال العنوان والمحتوى')
      return
    }

    setLoading(true)

    try {
      const result = await callEmailAPI('validate-content', { subject, html })
      setContentValidation(result)
    } catch (error) {
      alert('خطأ في التحقق: ' + (error instanceof Error ? error.message : 'خطأ غير معروف'))
    } finally {
      setLoading(false)
    }
  }

  const handleGetBestPractices = async () => {
    setLoading(true)

    try {
      const result = await callEmailAPI('get-best-practices')
      setBestPractices(result)
    } catch (error) {
      alert('خطأ في الحصول على أفضل الممارسات: ' + (error instanceof Error ? error.message : 'خطأ غير معروف'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-black text-dark mb-6">🚀 أدوات اختبار الإيميل المحسن</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Email Test Section */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold text-dark mb-4">📧 اختبار الإرسال</h2>

          <div className="space-y-4">
            <Input
              label="الإيميل المستهدف"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="test@example.com"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleTestSend('basic')}
                disabled={loading}
                size="sm"
              >
                اختبار أساسي
              </Button>
              <Button
                onClick={() => handleTestSend('template')}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                اختبار القالب
              </Button>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{testResult.success ? '✅' : '❌'}</span>
                  <span className="font-bold">
                    {testResult.success ? 'تم الإرسال بنجاح' : 'فشل الإرسال'}
                  </span>
                </div>

                {testResult.validation && (
                  <div className="text-sm space-y-1">
                    <p>درجة التحقق: {testResult.validation.score}/10</p>
                    <p>حالة spam: {testResult.validation.isSpammy ? '⚠️ محتمل' : '✅ آمن'}</p>
                    {testResult.validation.warnings.length > 0 && (
                      <div>
                        <p className="font-medium">التحذيرات:</p>
                        <ul className="list-disc list-inside">
                          {testResult.validation.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {testResult.error && (
                  <p className="text-sm mt-2">خطأ: {testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Validation Section */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold text-dark mb-4">🔍 تحليل المحتوى</h2>

          <div className="space-y-4">
            <Input
              label="عنوان الرسالة"
              id="test-subject"
              placeholder="اختبار العنوان..."
            />

            <div>
              <label className="block text-sm font-medium text-dark mb-1">محتوى HTML</label>
              <textarea
                id="test-html"
                rows={4}
                className="w-full px-3 py-2 border border-border rounded-lg resize-none"
                placeholder="<div>محتوى تجريبي...</div>"
              />
            </div>

            <Button
              onClick={handleValidateContent}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              تحليل المحتوى
            </Button>

            {contentValidation && (
              <div className="space-y-3">
                <div className={`p-3 rounded-lg border ${
                  contentValidation.validation.isSpammy
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">درجة التحقق:</span> {contentValidation.validation.score}/10
                    </p>
                    <p>
                      <span className="font-medium">حالة spam:</span>{' '}
                      {contentValidation.validation.isSpammy ? '⚠️ محتمل' : '✅ آمن'}
                    </p>
                  </div>
                </div>

                {contentValidation.validation.warnings.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg">
                    <p className="font-medium text-orange-800 mb-2">التحذيرات:</p>
                    <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
                      {contentValidation.validation.warnings.map((warning: string, i: number) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {contentValidation.suggestions && (
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    <p className="font-medium text-blue-800 mb-2">الاقتراحات:</p>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                      {contentValidation.suggestions.map((suggestion: string, i: number) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Best Practices Section */}
        <div className="bg-card rounded-2xl border border-border p-6 md:col-span-2">
          <h2 className="text-lg font-bold text-dark mb-4">📚 أفضل الممارسات</h2>

          <Button
            onClick={handleGetBestPractices}
            disabled={loading}
            variant="outline"
            size="sm"
            className="mb-4"
          >
            عرض أفضل الممارسات
          </Button>

          {bestPractices && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h3 className="font-bold text-blue-800 mb-2">العنوان</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  {bestPractices.categories.subject.map((item: string, i: number) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <h3 className="font-bold text-green-800 mb-2">المحتوى</h3>
                <ul className="text-sm text-green-700 space-y-1">
                  {bestPractices.categories.content.map((item: string, i: number) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                <h3 className="font-bold text-purple-800 mb-2">تقني</h3>
                <ul className="text-sm text-purple-700 space-y-1">
                  {bestPractices.categories.technical.map((item: string, i: number) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {bestPractices && (
            <div className="mt-4 bg-gray-50 border border-gray-200 p-4 rounded-lg">
              <h3 className="font-bold text-gray-800 mb-2">الممارسات العامة</h3>
              <div className="grid gap-1 text-sm text-gray-700 md:grid-cols-2">
                {bestPractices.practices.map((practice: string, i: number) => (
                  <div key={i}>{practice}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <p>جاري المعالجة...</p>
          </div>
        </div>
      )}
    </div>
  )
}