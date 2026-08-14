"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface ReminderStats {
  last30Days: Record<
    string,
    { total: number; byNumber: Record<string, number> }
  >;
  currentRequests: Array<{ status: string; count: number }>;
  totalReminders: number;
  generatedAt: string;
}

interface StaleRequest {
  id: string;
  requestNumber: string;
  clientName: string;
  clientEmail: string;
  status: string;
  daysWaiting: number;
}

interface CloseResult {
  success: boolean;
  closed?: number;
  emailed?: number;
  failed?: number;
  results?: {
    requestNumber: string;
    clientEmail: string;
    closed: boolean;
    emailed: boolean;
  }[];
  error?: string;
}

interface JobResult {
  success: boolean;
  processed?: number;
  sent?: number;
  skipped?: number;
  duration?: number;
  results?: Array<{
    requestNumber?: string;
    action?: string;
    reminderNumber?: number;
  }>;
  error?: string;
  timestamp?: string;
}

interface ReminderTestResult {
  success?: boolean;
  requestNumber?: string;
  status?: string;
  clientEmail?: string;
  reminderCount?: number;
  canSendReminder?: boolean;
  requiresAction?: boolean;
  emailSent?: boolean;
  daysSinceChange?: number;
  error?: string;
}

export default function AdminRemindersPage() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ReminderStats | null>(null);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [testRequestId, setTestRequestId] = useState("");
  const [testResult, setTestResult] = useState<ReminderTestResult | null>(null);

  // حالة قسم الطلبات المتوقفة
  const [staleLoading, setStaleLoading] = useState(false);
  const [staleRequests, setStaleRequests] = useState<StaleRequest[] | null>(
    null,
  );
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const callRemindersAPI = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("غير مصرح");
      }

      const response = await fetch("/api/admin/run-reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, ...params }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "خطأ في الاتصال");
      }

      return response.json();
    },
    [supabase],
  );

  const handleRunDailyJob = async () => {
    setLoading(true);
    setJobResult(null);

    try {
      const result = await callRemindersAPI("run-daily-job");
      setJobResult(result);

      // تحديث الإحصائيات بعد تشغيل الـ job
      if (result.success) {
        await loadStats();
      }
    } catch (error: unknown) {
      setJobResult({
        success: false,
        error: error instanceof Error ? error.message : "خطأ غير معروف",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestSingleReminder = async () => {
    if (!testRequestId.trim()) {
      alert("يرجى إدخال معرف الطلب");
      return;
    }

    setLoading(true);
    setTestResult(null);

    try {
      const result = await callRemindersAPI("test-single-reminder", {
        requestId: testRequestId.trim(),
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "خطأ غير معروف",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = useCallback(async () => {
    try {
      const result = await callRemindersAPI("get-reminder-stats");
      setStats(result);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }, [callRemindersAPI]);

  const handleCheckStatus = async () => {
    if (!testRequestId.trim()) {
      alert("يرجى إدخال معرف الطلب");
      return;
    }

    setLoading(true);

    try {
      const result = await callRemindersAPI("check-reminder-status", {
        requestId: testRequestId.trim(),
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "خطأ غير معروف",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── جلب معاينة الطلبات المتوقفة ──────────────────────────────────────────
  const handlePreviewStale = async () => {
    setStaleLoading(true);
    setStaleRequests(null);
    setCloseResult(null);
    setConfirmClose(false);
    try {
      const result = await callRemindersAPI("preview-stale");
      setStaleRequests(result.requests ?? []);
    } catch (error) {
      setStaleRequests([]);
    } finally {
      setStaleLoading(false);
    }
  };

  const handleCloseStale = async () => {
    setStaleLoading(true);
    setConfirmClose(false);
    try {
      const result = await callRemindersAPI("close-stale");
      setCloseResult(result);
      setStaleRequests(null); // أعد التحميل في المرة القادمة
    } catch (error) {
      setCloseResult({
        success: false,
        error: error instanceof Error ? error.message : "خطأ",
      });
    } finally {
      setStaleLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStats]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-black text-dark mb-6">
        📧 إدارة التذكيرات اليومية
      </h1>

      {/* ── قسم الطلبات المتوقفة ─────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border-2 border-amber-300 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-dark">
              🔒 مراجعة وإغلاق الطلبات المتوقفة
            </h2>
            <p className="text-sm text-muted mt-1">
              الطلبات التي مضى عليها أكثر من 7 أيام دون استجابة من العميل
            </p>
          </div>
          <Button
            onClick={handlePreviewStale}
            disabled={staleLoading}
            variant="outline"
            size="sm"
          >
            {staleLoading ? "⏳ جاري الفحص..." : "🔍 فحص الطلبات المتوقفة"}
          </Button>
        </div>

        {/* نتيجة الإغلاق */}
        {closeResult && (
          <div
            className={`p-4 rounded-xl mb-4 ${closeResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            {closeResult.success ? (
              <div className="text-green-800">
                <p className="font-bold mb-2">✅ تم الإغلاق بنجاح</p>
                <p className="text-sm">
                  أُغلق: <strong>{closeResult.closed}</strong> طلب · أُرسل إيميل
                  لـ <strong>{closeResult.emailed}</strong> عميل
                </p>
                {closeResult.results && (
                  <div className="mt-2 space-y-1">
                    {closeResult.results.map((r, i) => (
                      <p key={i} className="text-xs text-green-700">
                        {r.closed ? "✅" : "❌"} {r.requestNumber} —{" "}
                        {r.clientEmail} {r.emailed ? "📧" : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-800 text-sm">
                ❌ خطأ: {closeResult.error}
              </p>
            )}
          </div>
        )}

        {/* قائمة الطلبات المتوقفة */}
        {staleRequests !== null &&
          (staleRequests.length === 0 ? (
            <div className="text-center py-6 text-muted">
              <div className="text-3xl mb-2">✅</div>
              <p>لا توجد طلبات متوقفة — كل شيء نظيف!</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-amber-700">
                  ⚠️ يوجد <strong>{staleRequests.length}</strong> طلب متوقف سيتم
                  إغلاقه وإشعار أصحابه
                </p>
              </div>

              {/* جدول الطلبات */}
              <div className="overflow-x-auto rounded-xl border border-amber-200 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50">
                    <tr>
                      <th className="text-right p-3 font-bold text-amber-800">
                        رقم الطلب
                      </th>
                      <th className="text-right p-3 font-bold text-amber-800">
                        العميل
                      </th>
                      <th className="text-right p-3 font-bold text-amber-800">
                        البريد
                      </th>
                      <th className="text-right p-3 font-bold text-amber-800">
                        الحالة
                      </th>
                      <th className="text-right p-3 font-bold text-amber-800">
                        أيام الانتظار
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {staleRequests.map((r, i) => (
                      <tr
                        key={r.id}
                        className={i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}
                      >
                        <td className="p-3 font-mono font-bold text-dark">
                          {r.requestNumber}
                        </td>
                        <td className="p-3 text-dark">{r.clientName}</td>
                        <td className="p-3 text-muted text-xs">
                          {r.clientEmail}
                        </td>
                        <td className="p-3">
                          <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full">
                            {r.status === "pending"
                              ? "تحت المراجعة"
                              : "بانتظار الموافقة"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`font-bold ${r.daysWaiting >= 14 ? "text-red-600" : "text-amber-600"}`}
                          >
                            {r.daysWaiting} يوم
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* زر التأكيد */}
              {!confirmClose ? (
                <Button
                  onClick={() => setConfirmClose(true)}
                  disabled={staleLoading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  🔒 إغلاق {staleRequests.length} طلب وإشعار العملاء
                </Button>
              ) : (
                <div className="bg-red-50 border border-red-300 rounded-xl p-4">
                  <p className="text-red-800 font-bold text-center mb-3">
                    ⚠️ هل أنت متأكد؟ سيتم إغلاق {staleRequests.length} طلب
                    وإرسال إيميل لكل عميل
                  </p>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleCloseStale}
                      disabled={staleLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {staleLoading
                        ? "⏳ جاري الإغلاق..."
                        : "✅ نعم، أغلق الكل"}
                    </Button>
                    <Button
                      onClick={() => setConfirmClose(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
      {/* ───────────────────────────────────────────────────────────────── */}

      <div className="grid gap-6 md:grid-cols-2">
        {/* تشغيل Job يدوي */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold text-dark mb-4">
            🚀 تشغيل Job التذكيرات
          </h2>

          <div className="space-y-4">
            <p className="text-sm text-muted">
              تشغيل job التذكيرات يدوياً للاختبار أو الاستخدام الطارئ
            </p>

            <Button
              onClick={handleRunDailyJob}
              disabled={loading}
              className="w-full"
            >
              {loading ? "جاري التشغيل..." : "▶️ تشغيل التذكيرات الآن"}
            </Button>

            {jobResult && (
              <div
                className={`p-4 rounded-lg border ${
                  jobResult.success
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span>{jobResult.success ? "✅" : "❌"}</span>
                  <span className="font-bold">
                    {jobResult.success ? "تم تشغيل Job بنجاح" : "فشل تشغيل Job"}
                  </span>
                </div>

                {jobResult.success && (
                  <div className="text-sm space-y-1">
                    <p>تمت معالجة: {jobResult.processed} طلب</p>
                    <p>تم إرسال: {jobResult.sent} تذكير</p>
                    <p>تم تخطي: {jobResult.skipped} طلب</p>
                    {jobResult.duration && (
                      <p>المدة: {formatDuration(jobResult.duration)}</p>
                    )}
                  </div>
                )}

                {jobResult.error && (
                  <p className="text-sm mt-2">خطأ: {jobResult.error}</p>
                )}

                {jobResult.results && jobResult.results.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-sm font-medium cursor-pointer">
                      تفاصيل النتائج ({jobResult.results.length})
                    </summary>
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {jobResult.results.map((result, i) => (
                        <div
                          key={i}
                          className="text-xs py-1 border-b border-gray-200 last:border-0"
                        >
                          <span className="font-mono">
                            {result.requestNumber}
                          </span>
                          <span className="mx-2">·</span>
                          <span
                            className={
                              result.action === "sent"
                                ? "text-green-600"
                                : result.action === "skipped"
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }
                          >
                            {result.action}
                          </span>
                          {result.reminderNumber && (
                            <span className="text-gray-500">
                              {" "}
                              (#{result.reminderNumber})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

        {/* اختبار تذكير واحد */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold text-dark mb-4">
            🧪 اختبار التذكيرات
          </h2>

          <div className="space-y-4">
            <Input
              label="معرف الطلب"
              value={testRequestId}
              onChange={(e) => setTestRequestId(e.target.value)}
              placeholder="مثال: 123e4567-e89b-12d3-a456-426614174000"
            />

            <div className="flex gap-2">
              <Button
                onClick={handleTestSingleReminder}
                disabled={loading}
                size="sm"
                variant="outline"
              >
                📤 إرسال تذكير
              </Button>
              <Button
                onClick={handleCheckStatus}
                disabled={loading}
                size="sm"
                variant="outline"
              >
                🔍 فحص الحالة
              </Button>
            </div>

            {testResult && (
              <div
                className={`p-4 rounded-lg border ${
                  testResult.success !== false
                    ? "bg-blue-50 border-blue-200 text-blue-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {testResult.success !== false ? (
                  <div className="space-y-2">
                    {testResult.requestNumber && (
                      <p>
                        <strong>رقم الطلب:</strong> {testResult.requestNumber}
                      </p>
                    )}
                    {testResult.status && (
                      <p>
                        <strong>الحالة:</strong> {testResult.status}
                      </p>
                    )}
                    {testResult.clientEmail && (
                      <p>
                        <strong>بريد العميل:</strong> {testResult.clientEmail}
                      </p>
                    )}
                    {testResult.reminderCount !== undefined && (
                      <p>
                        <strong>عدد التذكيرات:</strong>{" "}
                        {testResult.reminderCount}
                      </p>
                    )}
                    {testResult.canSendReminder !== undefined && (
                      <p>
                        <strong>يمكن إرسال تذكير:</strong>{" "}
                        {testResult.canSendReminder ? "✅" : "❌"}
                      </p>
                    )}
                    {testResult.requiresAction !== undefined && (
                      <p>
                        <strong>يحتاج إجراء:</strong>{" "}
                        {testResult.requiresAction ? "✅" : "❌"}
                      </p>
                    )}
                    {testResult.emailSent !== undefined && (
                      <p>
                        <strong>تم إرسال البريد:</strong>{" "}
                        {testResult.emailSent ? "✅" : "❌"}
                      </p>
                    )}
                    {testResult.daysSinceChange && (
                      <p>
                        <strong>أيام منذ التغيير:</strong>{" "}
                        {testResult.daysSinceChange}
                      </p>
                    )}
                  </div>
                ) : (
                  <p>خطأ: {testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* إحصائيات التذكيرات */}
        <div className="bg-card rounded-2xl border border-border p-6 md:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-dark">
              📊 إحصائيات التذكيرات
            </h2>
            <Button
              onClick={loadStats}
              disabled={loading}
              size="sm"
              variant="outline"
            >
              🔄 تحديث
            </Button>
          </div>

          {stats ? (
            <div className="grid gap-4 md:grid-cols-3">
              {/* إحصائيات عامة */}
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h3 className="font-bold text-blue-800 mb-2">📈 آخر 30 يوم</h3>
                <div className="space-y-2 text-sm">
                  <p>
                    إجمالي التذكيرات: <strong>{stats.totalReminders}</strong>
                  </p>
                  {Object.entries(stats.last30Days).map(([type, data]) => (
                    <div key={type}>
                      <p className="font-medium">{type}:</p>
                      <p className="text-blue-600 mr-2">
                        المجموع: {data.total}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* الطلبات الحالية */}
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <h3 className="font-bold text-yellow-800 mb-2">
                  ⏳ الطلبات الحالية
                </h3>
                <div className="space-y-1 text-sm">
                  {stats.currentRequests.map((req, i) => (
                    <p key={i}>
                      <span className="font-medium">{req.status}:</span>{" "}
                      {req.count}
                    </p>
                  ))}
                </div>
              </div>

              {/* معلومات النظام */}
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <h3 className="font-bold text-green-800 mb-2">
                  ⚙️ إعدادات النظام
                </h3>
                <div className="space-y-1 text-sm text-green-700">
                  <p>• تذكير العرض: بعد 2 أيام</p>
                  <p>• تذكير الدفع: بعد 1 يوم</p>
                  <p>• تذكير المراجعة: بعد 3 أيام</p>
                  <p>• حد أقصى: 5-7 تذكيرات</p>
                  <p>• فترة التكرار: 2-4 أيام</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <LoadingSpinner size="sm" />
              <p className="text-muted mt-2">جاري تحميل الإحصائيات...</p>
            </div>
          )}

          {stats && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted">
                آخر تحديث: {new Date(stats.generatedAt).toLocaleString("ar")}
              </p>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <LoadingSpinner size="lg" />
            <p className="text-center mt-4">جاري المعالجة...</p>
          </div>
        </div>
      )}
    </div>
  );
}
