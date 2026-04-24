-- ═══════════════════════════════════════════════════════════════════
-- 🔍 سكربت التحقق الآمن من pg_cron (يتعامل مع الأعمدة المفقودة)
-- Safe verification script for pg-cron (handles missing columns)
-- ═══════════════════════════════════════════════════════════════════

-- ══════ 1. فحص امتداد pg_cron ══════
SELECT '══════ 1. فحص امتداد pg_cron ══════' as verification_step;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
        )
        THEN '✅ pg_cron extension is installed'
        ELSE '❌ pg_cron extension is NOT installed - run: CREATE EXTENSION pg_cron;'
    END as extension_status;

-- Check cron schema permissions
SELECT
    CASE
        WHEN has_schema_privilege('postgres', 'cron', 'USAGE')
        THEN '✅ postgres user has USAGE permission on cron schema'
        ELSE '❌ Missing permissions - run: GRANT USAGE ON SCHEMA cron TO postgres;'
    END as permission_status;

-- ══════ 2. فحص دالة الإصلاح ══════
SELECT '══════ 2. فحص دالة الإصلاح ══════' as verification_step;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE p.proname = 'fix_stuck_approved_requests'
            AND n.nspname = 'public'
        )
        THEN '✅ fix_stuck_approved_requests() function exists'
        ELSE '❌ Function does NOT exist - check supabase-pg-cron.sql'
    END as function_status;

-- ══════ 3. فحص الوظائف المجدولة ══════
SELECT '══════ 3. فحص الوظائف المجدولة ══════' as verification_step;

SELECT
    jobname,
    schedule,
    command,
    active,
    jobid
FROM cron.job
WHERE jobname = 'fix-stuck-approved-requests'
ORDER BY jobid;

-- Count total cron jobs
SELECT
    COUNT(*) as total_cron_jobs,
    COUNT(CASE WHEN active THEN 1 END) as active_jobs,
    COUNT(CASE WHEN NOT active THEN 1 END) as inactive_jobs
FROM cron.job;

-- ══════ 4. سجل التنفيذ الأخير ══════
SELECT '══════ 4. سجل التنفيذ الأخير ══════' as verification_step;

SELECT
    jr.jobid,
    j.jobname,
    jr.start_time AT TIME ZONE 'Asia/Riyadh' as start_time_riyadh,
    jr.end_time AT TIME ZONE 'Asia/Riyadh' as end_time_riyadh,
    EXTRACT(EPOCH FROM (jr.end_time - jr.start_time)) as duration_seconds,
    jr.return_message,
    CASE
        WHEN jr.return_message IS NULL THEN '✅ SUCCESS'
        WHEN jr.return_message = '' THEN '✅ SUCCESS'
        ELSE '⚠️ ' || jr.return_message
    END as status
FROM cron.job_run_details jr
JOIN cron.job j ON jr.jobid = j.jobid
WHERE j.jobname = 'fix-stuck-approved-requests'
ORDER BY jr.start_time DESC
LIMIT 10;

-- ══════ 5. فحص أعمدة الدفع المطلوبة ══════
SELECT '══════ 5. فحص أعمدة الدفع المطلوبة ══════' as verification_step;

WITH required_columns AS (
    SELECT unnest(ARRAY[
        'moyasar_payment_id',
        'payment_status',
        'paid_at',
        'moyasar_reference',
        'moyasar_auth_code',
        'payment_method'
    ]) as column_name
),
existing_columns AS (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'publish_requests'
    AND table_schema = 'public'
)
SELECT
    rc.column_name,
    CASE
        WHEN ec.column_name IS NOT NULL
        THEN '✅ EXISTS'
        ELSE '❌ MISSING - run add-missing-payment-columns.sql'
    END as status
FROM required_columns rc
LEFT JOIN existing_columns ec ON rc.column_name = ec.column_name
ORDER BY rc.column_name;

-- ══════ 6. فحص جدول webhook_logs ══════
SELECT '══════ 6. فحص جدول webhook_logs ══════' as verification_step;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'webhook_logs' AND table_schema = 'public'
        )
        THEN '✅ webhook_logs table exists'
        ELSE '❌ webhook_logs table is MISSING - run add-missing-payment-columns.sql'
    END as webhook_table_status;

-- ══════ 7. فحص الطلبات حسب الحالة الحالية ══════
SELECT '══════ 7. فحص الطلبات حسب الحالة الحالية ══════' as verification_step;

-- Check requests by status (works with current schema)
SELECT
    status,
    COUNT(*) as request_count,
    MIN(created_at AT TIME ZONE 'Asia/Riyadh') as oldest_request,
    MAX(created_at AT TIME ZONE 'Asia/Riyadh') as newest_request
FROM publish_requests
GROUP BY status
ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'approved' THEN 2
        WHEN 'in_progress' THEN 3
        WHEN 'completed' THEN 4
        WHEN 'rejected' THEN 5
        ELSE 6
    END;

-- Show recent approved requests (potential stuck payments if columns exist)
SELECT
    id,
    request_number,
    status,
    final_total,
    updated_at AT TIME ZONE 'Asia/Riyadh' as last_updated_riyadh,
    ROUND(EXTRACT(HOURS FROM (now() - updated_at))::numeric, 1) as hours_since_update
FROM publish_requests
WHERE status = 'approved'
    AND updated_at < (now() - interval '1 hour')
ORDER BY updated_at
LIMIT 5;

-- ══════ 8. اختبار الدالة (إذا كانت موجودة) ══════
SELECT '══════ 8. اختبار الدالة (إذا كانت موجودة) ══════' as verification_step;

-- Only run if function exists and required columns exist
DO $$
DECLARE
    function_exists boolean;
    columns_exist boolean;
BEGIN
    -- Check if function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'fix_stuck_approved_requests'
        AND n.nspname = 'public'
    ) INTO function_exists;

    -- Check if required column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'publish_requests'
        AND column_name = 'moyasar_payment_id'
        AND table_schema = 'public'
    ) INTO columns_exist;

    IF function_exists AND columns_exist THEN
        PERFORM fix_stuck_approved_requests();
        RAISE NOTICE '✅ Function test completed successfully';
    ELSIF function_exists AND NOT columns_exist THEN
        RAISE NOTICE '⚠️ Function exists but payment columns are missing - run migration first';
    ELSIF NOT function_exists AND columns_exist THEN
        RAISE NOTICE '⚠️ Payment columns exist but function is missing - run supabase-pg-cron.sql';
    ELSE
        RAISE NOTICE '❌ Both function and payment columns are missing - run migration then pg-cron setup';
    END IF;
END $$;

-- ══════ 9. ملخص الحالة العامة ══════
SELECT '══════ 9. ملخص الحالة العامة ══════' as verification_step;

WITH health_check AS (
    SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') as extension_ok,
        EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'fix_stuck_approved_requests') as function_ok,
        EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'fix-stuck-approved-requests' AND active) as job_ok,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name = 'publish_requests' AND column_name = 'moyasar_payment_id') as columns_ok,
        EXISTS(SELECT 1 FROM information_schema.tables
               WHERE table_name = 'webhook_logs') as webhook_table_ok,
        (SELECT COUNT(*) FROM publish_requests WHERE status = 'approved') as approved_count
)
SELECT
    CASE
        WHEN extension_ok AND function_ok AND job_ok AND columns_ok AND webhook_table_ok
        THEN '🟢 FULLY READY: All components are set up correctly'
        WHEN extension_ok AND function_ok AND job_ok AND NOT (columns_ok AND webhook_table_ok)
        THEN '🟡 PARTIALLY READY: pg_cron ready but payment columns missing'
        WHEN extension_ok AND (columns_ok AND webhook_table_ok) AND NOT (function_ok AND job_ok)
        THEN '🟡 PARTIALLY READY: Database ready but pg_cron setup incomplete'
        WHEN extension_ok AND NOT function_ok AND NOT job_ok AND NOT (columns_ok AND webhook_table_ok)
        THEN '🟠 SETUP REQUIRED: Only pg_cron extension installed'
        WHEN NOT extension_ok
        THEN '🔴 NOT READY: pg_cron extension not installed'
        ELSE '🔴 MIXED STATE: Check individual components above'
    END as overall_status,

    CASE
        WHEN approved_count = 0 THEN '✅ No approved requests waiting'
        WHEN approved_count <= 5 THEN '⚠️ ' || approved_count || ' approved requests (normal)'
        ELSE '❌ ' || approved_count || ' approved requests (high volume)'
    END as requests_status,

    -- Next steps guidance
    CASE
        WHEN NOT extension_ok THEN '1. Run: CREATE EXTENSION pg_cron'
        WHEN extension_ok AND NOT (columns_ok AND webhook_table_ok) THEN '1. Run: add-missing-payment-columns.sql'
        WHEN extension_ok AND (columns_ok AND webhook_table_ok) AND NOT (function_ok AND job_ok) THEN '1. Run: supabase-pg-cron.sql'
        WHEN extension_ok AND function_ok AND job_ok AND columns_ok AND webhook_table_ok THEN '✅ System ready for production'
        ELSE '1. Check individual status messages above'
    END as next_step

FROM health_check;

-- Final completion message
SELECT '✅ Safe verification complete!' as final_status;
SELECT 'Check the overall_status above for next steps' as guidance;