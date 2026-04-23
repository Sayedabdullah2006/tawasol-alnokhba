/**
 * مكوّن تشخيص المحتوى المرسل للعملاء
 * يساعد في فهم سبب عدم ظهور الصور
 */

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'

interface ContentDebuggerProps {
  requestId?: string
}

export default function ContentDebugger({ requestId }: ContentDebuggerProps) {
  const [debugData, setDebugData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [storageTest, setStorageTest] = useState<any>(null)

  const checkRequest = async () => {
    if (!requestId) return
    setLoading(true)

    try {
      const supabase = createClient()

      // فحص بيانات الطلب
      const { data: request, error } = await supabase
        .from('publish_requests')
        .select('proposed_content, proposed_images, content_sent_at')
        .eq('id', requestId)
        .single()

      // فحص storage bucket
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()

      // فحص ملفات content-images
      const { data: files, error: filesError } = await supabase.storage
        .from('content-images')
        .list('', { limit: 10 })

      setDebugData({
        request,
        requestError: error,
        buckets,
        bucketError,
        files: files || [],
        filesError,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Debug check failed:', error)
      setDebugData({ error: error instanceof Error ? error.message : 'خطأ غير معروف' })
    } finally {
      setLoading(false)
    }
  }

  const testStorageUpload = async () => {
    setLoading(true)
    try {
      const supabase = createClient()

      // إنشاء ملف تجريبي صغير
      const testBlob = new Blob(['test content'], { type: 'text/plain' })
      const testFile = new File([testBlob], 'test.txt', { type: 'text/plain' })

      const path = `debug-test-${Date.now()}.txt`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('content-images')
        .upload(path, testFile)

      if (!uploadError) {
        // الحصول على URL عام
        const { data: urlData } = supabase.storage
          .from('content-images')
          .getPublicUrl(path)

        // حذف الملف التجريبي
        await supabase.storage
          .from('content-images')
          .remove([path])

        setStorageTest({
          success: true,
          uploadData,
          publicUrl: urlData.publicUrl
        })
      } else {
        setStorageTest({
          success: false,
          error: uploadError
        })
      }

    } catch (error) {
      setStorageTest({
        success: false,
        error: error instanceof Error ? error.message : 'خطأ غير معروف'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
      <h3 className="font-bold text-red-700 mb-3">🔍 تشخيص مشكلة الصور</h3>

      <div className="flex gap-2 mb-4">
        <Button
          onClick={checkRequest}
          loading={loading}
          size="sm"
          disabled={!requestId}
        >
          فحص الطلب
        </Button>
        <Button
          onClick={testStorageUpload}
          loading={loading}
          size="sm"
          variant="outline"
        >
          اختبار Storage
        </Button>
      </div>

      {debugData && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg p-3 text-xs">
            <div className="font-bold text-red-700 mb-2">📋 بيانات الطلب:</div>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          </div>

          {debugData.request && (
            <div className="space-y-2">
              <div className="bg-green-50 p-2 rounded">
                <strong>المحتوى:</strong> {debugData.request.proposed_content ? '✅ موجود' : '❌ مفقود'}
              </div>
              <div className="bg-blue-50 p-2 rounded">
                <strong>الصور:</strong> {
                  debugData.request.proposed_images && Array.isArray(debugData.request.proposed_images)
                    ? `✅ ${debugData.request.proposed_images.length} صورة`
                    : '❌ مفقودة'
                }
                {debugData.request.proposed_images && (
                  <div className="mt-1">
                    {debugData.request.proposed_images.map((url: string, i: number) => (
                      <div key={i} className="text-xs break-all">
                        {i + 1}. {url}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-purple-50 p-2 rounded">
                <strong>تاريخ الإرسال:</strong> {debugData.request.content_sent_at || 'لم يرسل بعد'}
              </div>
            </div>
          )}
        </div>
      )}

      {storageTest && (
        <div className="bg-white rounded-lg p-3 mt-3">
          <div className="font-bold text-red-700 mb-2">🗄️ نتيجة اختبار Storage:</div>
          {storageTest.success ? (
            <div className="text-green-600">
              ✅ Storage يعمل بشكل صحيح<br/>
              <span className="text-xs">URL: {storageTest.publicUrl}</span>
            </div>
          ) : (
            <div className="text-red-600">
              ❌ مشكلة في Storage: {JSON.stringify(storageTest.error)}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-red-600 mt-3">
        💡 استخدم هذه الأدوات لفهم سبب عدم ظهور الصور للعملاء
      </div>
    </div>
  )
}