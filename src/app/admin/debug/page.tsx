'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface ConfigData {
  status: string;
  config: {
    environment: string;
    siteUrl: string;
    timestamp: string;
    variables: {
      publishableKey: {
        exists: boolean;
        type: string;
        canLoad?: boolean;
        preview?: string;
        error?: string;
      };
      secretKey: {
        exists: boolean;
        type: string;
        canLoad?: boolean;
        error?: string;
      };
      testSecretKey: {
        exists: boolean;
        type: string;
        canLoad?: boolean;
        error?: string;
      };
      webhookSecret: {
        exists: boolean;
        configured: boolean;
      };
    };
    callbacks: {
      paymentCallback: string;
      webhookUrl: string;
    };
  };
  recommendations: string[];
  message: string;
}

export default function AdminDebugPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [configData, setConfigData] = useState<ConfigData | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      setLoading(false)
    }

    checkAuth()
  }, [supabase, router])

  const checkConfig = async () => {
    setChecking(true)
    try {
      const response = await fetch('/api/debug/moyasar-config')
      const data = await response.json()
      setConfigData(data)
    } catch (error) {
      console.error('Error checking config:', error)
    } finally {
      setChecking(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />

  const getStatusIcon = (type: string) => {
    switch (type) {
      case 'LIVE': return '🟢'
      case 'TEST': return '🟡'
      case 'MISSING': return '❌'
      case 'INVALID': return '🔴'
      default: return '❓'
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-black text-dark mb-6">تشخيص إعدادات النظام</h1>

        <div className="bg-card rounded-2xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-dark">إعدادات Moyasar</h2>
            <Button onClick={checkConfig} loading={checking}>
              🔍 فحص الإعدادات
            </Button>
          </div>

          {configData && (
            <div className="space-y-6">
              {/* Environment Info */}
              <div className="bg-cream rounded-xl p-4">
                <h3 className="font-bold text-dark mb-2">معلومات البيئة</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted">البيئة:</span>
                    <span className="font-mono mr-2">{configData.config.environment}</span>
                  </div>
                  <div>
                    <span className="text-muted">رابط الموقع:</span>
                    <span className="font-mono mr-2 break-all">{configData.config.siteUrl}</span>
                  </div>
                  <div>
                    <span className="text-muted">وقت الفحص:</span>
                    <span className="font-mono mr-2 text-xs">{new Date(configData.config.timestamp).toLocaleString('ar-SA')}</span>
                  </div>
                </div>
              </div>

              {/* Variables Status */}
              <div className="bg-cream rounded-xl p-4">
                <h3 className="font-bold text-dark mb-3">حالة المتغيرات</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div>
                      <span className="font-medium">Publishable Key</span>
                      {configData.config.variables.publishableKey.preview && (
                        <span className="text-xs text-muted mr-2">{configData.config.variables.publishableKey.preview}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{getStatusIcon(configData.config.variables.publishableKey.type)}</span>
                      <span className="text-sm font-mono">{configData.config.variables.publishableKey.type}</span>
                      {!configData.config.variables.publishableKey.canLoad && (
                        <span className="text-xs text-red-600">❌ فشل التحميل</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="font-medium">Secret Key</span>
                    <div className="flex items-center gap-2">
                      <span>{getStatusIcon(configData.config.variables.secretKey.type)}</span>
                      <span className="text-sm font-mono">{configData.config.variables.secretKey.type}</span>
                      {!configData.config.variables.secretKey.canLoad && (
                        <span className="text-xs text-red-600">❌ فشل التحميل</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="font-medium">Test Secret Key</span>
                    <div className="flex items-center gap-2">
                      <span>{getStatusIcon(configData.config.variables.testSecretKey.type)}</span>
                      <span className="text-sm font-mono">{configData.config.variables.testSecretKey.type}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="font-medium">Webhook Secret</span>
                    <div className="flex items-center gap-2">
                      <span>{configData.config.variables.webhookSecret.configured ? '✅' : '❌'}</span>
                      <span className="text-sm font-mono">{configData.config.variables.webhookSecret.configured ? 'CONFIGURED' : 'MISSING'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Callback URLs */}
              <div className="bg-cream rounded-xl p-4">
                <h3 className="font-bold text-dark mb-3">عناوين الاستدعاء</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted">Payment Callback:</span>
                    <div className="font-mono text-xs mt-1 p-2 bg-white rounded break-all">
                      {configData.config.callbacks.paymentCallback}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted">Webhook URL:</span>
                    <div className="font-mono text-xs mt-1 p-2 bg-white rounded break-all">
                      {configData.config.callbacks.webhookUrl}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              {configData.recommendations.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <h3 className="font-bold text-orange-700 mb-3">التوصيات</h3>
                  <ul className="space-y-2">
                    {configData.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm text-orange-600">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Status Message */}
              <div className={`p-4 rounded-xl text-center ${
                configData.recommendations.length === 0
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
              }`}>
                <div className="font-bold">{configData.message}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-bold text-blue-700 mb-2">📋 خطوات إضافة المتغيرات في Railway</h3>
          <ol className="text-sm text-blue-600 space-y-1">
            <li>1. افتح لوحة تحكم Railway</li>
            <li>2. اذهب إلى Variables</li>
            <li>3. أضف كل متغير بقيمته الصحيحة</li>
            <li>4. أعد تشغيل التطبيق</li>
          </ol>
        </div>
      </div>
    </div>
  )
}