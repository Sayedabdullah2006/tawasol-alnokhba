-- ═══════════════════════════════════════════════════════════════════
-- ✅ قائمة التحقق النهائية لنشر نظام دفع ميسر
-- Final deployment checklist for Moyasar payment system
-- ═══════════════════════════════════════════════════════════════════

-- الخطوة 1: فحص البيئة والمتغيرات
SELECT '🔧 فحص البيئة والمتغيرات' as step_title;

-- فحص امتدادات قاعدة البيانات
SELECT
    'pg_cron extension' as component,
    CASE WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
         THEN '✅ مثبت' ELSE '❌ غير مثبت' END as status
UNION ALL
SELECT
    'cron schema permissions' as component,
    CASE WHEN has_schema_privilege('postgres', 'cron', 'USAGE')
         THEN '✅ متاح' ELSE '❌ مفقود' END as status;

-- الخطوة 2: فحص هيكل قاعدة البيانات
SELECT '🗄️ فحص هيكل قاعدة البيانات' as step_title;

-- فحص الأعمدة المطلوبة
WITH required_payment_columns AS (
    SELECT unnest(ARRAY[
        'moyasar_payment_id',
        'payment_status',
        'paid_at',
        'moyasar_reference',
        'moyasar_auth_code',
        'payment_method'
    ]) as column_name
)
SELECT
    'Payment columns: ' || rpc.column_name as component,
    CASE WHEN ic.column_name IS NOT NULL
         THEN '✅ موجود' ELSE '❌ مفقود' END as status
FROM required_payment_columns rpc
LEFT JOIN information_schema.columns ic ON (
    ic.column_name = rpc.column_name
    AND ic.table_name = 'publish_requests'
    AND ic.table_schema = 'public'
)
ORDER BY rpc.column_name;

-- فحص الجداول المساعدة
SELECT
    'webhook_logs table' as component,
    CASE WHEN EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'webhook_logs' AND table_schema = 'public'
    ) THEN '✅ موجود' ELSE '❌ مفقود' END as status;

-- الخطوة 3: فحص دالة وجدولة pg_cron
SELECT '⏰ فحص دالة وجدولة pg_cron' as step_title;

-- فحص الدالة
SELECT
    'fix_stuck_approved_requests function' as component,
    CASE WHEN EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'fix_stuck_approved_requests' AND n.nspname = 'public'
    ) THEN '✅ موجود' ELSE '❌ مفقود' END as status;

-- فحص الوظيفة المجدولة
SELECT
    'Scheduled cron job' as component,
    CASE WHEN EXISTS(
        SELECT 1 FROM cron.job
        WHERE jobname = 'fix-stuck-approved-requests' AND active
    ) THEN '✅ نشط' ELSE '❌ غير نشط' END as status;

-- عرض تفاصيل الوظيفة
SELECT
    jobname,
    schedule,
    active,
    'Next run: top of next hour' as next_execution
FROM cron.job
WHERE jobname = 'fix-stuck-approved-requests';

-- الخطوة 4: اختبار الدالة يدوياً
SELECT '🧪 اختبار الدالة يدوياً' as step_title;

-- تشغيل الدالة (آمن حتى لو لم توجد طلبات عالقة)
DO $$
DECLARE
    requests_before INTEGER;
    requests_after INTEGER;
    stuck_count INTEGER;
BEGIN
    -- عدد الطلبات المعلقة قبل التشغيل
    SELECT COUNT(*) INTO stuck_count
    FROM publish_requests
    WHERE status = 'approved'
    AND moyasar_payment_id IS NOT NULL
    AND updated_at < (now() - interval '1 hour');

    -- تشغيل الدالة
    PERFORM fix_stuck_approved_requests();

    RAISE NOTICE '✅ Function executed successfully';
    RAISE NOTICE 'ℹ️  Found % potentially stuck requests', stuck_count;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Function execution failed: %', SQLERRM;
END $$;

-- الخطوة 5: فحص سجل التنفيذ
SELECT '📊 فحص سجل التنفيذ' as step_title;

-- آخر تنفيذات الوظيفة
SELECT
    'Last execution' as metric,
    CASE
        WHEN jr.start_time IS NOT NULL
        THEN '✅ ' || jr.start_time::text
        ELSE '⚠️ لا توجد تنفيذات بعد'
    END as value
FROM cron.job j
LEFT JOIN cron.job_run_details jr ON j.jobid = jr.jobid
WHERE j.jobname = 'fix-stuck-approved-requests'
ORDER BY jr.start_time DESC
LIMIT 1;

-- إحصائيات التنفيذ الأخيرة
SELECT
    COUNT(*) as total_executions,
    COUNT(CASE WHEN return_message IS NULL OR return_message = '' THEN 1 END) as successful_executions,
    MAX(start_time) as last_execution_time
FROM cron.job_run_details jr
JOIN cron.job j ON jr.jobid = j.jobid
WHERE j.jobname = 'fix-stuck-approved-requests'
AND jr.start_time > (now() - interval '24 hours');

-- الخطوة 6: فحص الطلبات والبيانات
SELECT '📋 فحص الطلبات والبيانات' as step_title;

-- إحصائيات الطلبات حسب الحالة
SELECT
    status,
    COUNT(*) as count,
    MAX(updated_at) as latest_update
FROM publish_requests
GROUP BY status
ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'approved' THEN 2
        WHEN 'in_progress' THEN 3
        WHEN 'completed' THEN 4
        ELSE 5
    END;

-- فحص الطلبات المحتملة للعلق
WITH potentially_stuck AS (
    SELECT
        COUNT(*) as stuck_count,
        MIN(updated_at) as oldest_stuck
    FROM publish_requests
    WHERE status = 'approved'
    AND updated_at < (now() - interval '2 hours') -- أكثر من ساعتين
)
SELECT
    'Potentially stuck requests' as metric,
    CASE
        WHEN stuck_count = 0 THEN '✅ لا توجد طلبات عالقة'
        WHEN stuck_count <= 3 THEN '⚠️ ' || stuck_count || ' طلبات (مقبول)'
        ELSE '❌ ' || stuck_count || ' طلبات (يحتاج مراجعة)'
    END as status,
    COALESCE(oldest_stuck::text, 'N/A') as oldest_stuck_at
FROM potentially_stuck;

-- الخطوة 7: فحص سجل webhook
SELECT '🔗 فحص سجل webhook' as step_title;

-- إحصائيات webhook آخر 24 ساعة (إن وُجد)
SELECT
    'Webhook events (24h)' as metric,
    CASE
        WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_logs')
        THEN (
            SELECT COALESCE(COUNT(*)::text, '0')
            FROM webhook_logs
            WHERE created_at > (now() - interval '24 hours')
        )
        ELSE 'Table not yet created'
    END as count;

-- الخطوة 8: التقييم النهائي
SELECT '🎯 التقييم النهائي' as step_title;

WITH system_health AS (
    SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') as pg_cron_ok,
        EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'fix_stuck_approved_requests') as function_ok,
        EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'fix-stuck-approved-requests' AND active) as cron_job_ok,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name = 'publish_requests' AND column_name = 'moyasar_payment_id') as columns_ok,
        (SELECT COUNT(*) FROM publish_requests
         WHERE status = 'approved' AND updated_at < (now() - interval '2 hours')) as stuck_count
)
SELECT
    'Overall System Status' as component,
    CASE
        WHEN pg_cron_ok AND function_ok AND cron_job_ok AND columns_ok AND stuck_count <= 3
        THEN '🟢 PRODUCTION READY! 🚀'
        WHEN pg_cron_ok AND function_ok AND cron_job_ok AND columns_ok AND stuck_count > 3
        THEN '🟡 MOSTLY READY - Review stuck requests'
        WHEN pg_cron_ok AND function_ok AND NOT cron_job_ok AND columns_ok
        THEN '🟡 ACTIVATE CRON JOB - Run: SELECT cron.schedule(...)'
        WHEN pg_cron_ok AND NOT function_ok AND columns_ok
        THEN '🟠 INSTALL FUNCTION - Run: supabase-pg-cron.sql'
        WHEN NOT columns_ok
        THEN '🔴 ADD COLUMNS - Run: add-missing-payment-columns.sql'
        WHEN NOT pg_cron_ok
        THEN '🔴 INSTALL PG_CRON - Run: CREATE EXTENSION pg_cron'
        ELSE '🔴 MIXED STATE - Check individual components'
    END as status
FROM system_health;

-- رسالة النهاية
SELECT '🎉 Checklist Complete!' as final_message;
SELECT 'If you see 🟢 PRODUCTION READY above, your payment system is fully operational!' as guidance;