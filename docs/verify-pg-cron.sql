-- ═══════════════════════════════════════════════════════════════════
-- 🔍 سكربت التحقق من pg_cron لإصلاح الطلبات العالقة
-- Verification script for pg-cron stuck payments fix
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

-- Step 2: Check if the function exists
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

-- Get function details
SELECT
    p.proname as function_name,
    pg_get_function_result(p.oid) as return_type,
    pg_get_function_arguments(p.oid) as arguments,
    l.lanname as language
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE p.proname = 'fix_stuck_approved_requests'
AND n.nspname = 'public';

-- Step 3: Check scheduled jobs
-- ══════ 3. فحص الوظائف المجدولة ══════
SELECT '══════ 3. فحص الوظائف المجدولة ══════' as verification_step;
SELECT
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
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

-- Step 4: Check recent execution history
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

-- Step 5: Check for stuck requests that would be fixed
-- ══════ 5. فحص الطلبات العالقة الحالية ══════
SELECT '══════ 5. فحص الطلبات العالقة الحالية ══════' as verification_step;
WITH stuck_analysis AS (
    SELECT
        id,
        request_number,
        status,
        moyasar_payment_id,
        payment_status,
        updated_at AT TIME ZONE 'Asia/Riyadh' as last_updated_riyadh,
        EXTRACT(HOURS FROM (now() - updated_at)) as hours_stuck
    FROM publish_requests
    WHERE status = 'approved'
    AND moyasar_payment_id IS NOT NULL
    AND updated_at < (now() - interval '1 hour')
)
SELECT
    COUNT(*) as stuck_requests_count,
    MIN(hours_stuck) as min_hours_stuck,
    MAX(hours_stuck) as max_hours_stuck,
    AVG(hours_stuck) as avg_hours_stuck
FROM stuck_analysis;

-- Show actual stuck requests
SELECT
    id,
    request_number,
    moyasar_payment_id,
    updated_at AT TIME ZONE 'Asia/Riyadh' as last_updated_riyadh,
    ROUND(EXTRACT(HOURS FROM (now() - updated_at))::numeric, 1) as hours_stuck
FROM publish_requests
WHERE status = 'approved'
AND moyasar_payment_id IS NOT NULL
AND updated_at < (now() - interval '1 hour')
ORDER BY updated_at
LIMIT 5;

-- Step 6: Test the function manually (DRY RUN)
-- ══════ 6. اختبار الدالة يدوياً ══════
SELECT '══════ 6. اختبار الدالة يدوياً ══════' as verification_step;
SELECT 'Running fix_stuck_approved_requests() manually...' as test_info;

-- Run the function
SELECT fix_stuck_approved_requests();

-- Check what was fixed
SELECT
    'Fixed by manual run' as event,
    COUNT(*) as requests_processed
FROM publish_requests
WHERE status = 'in_progress'
AND payment_status = 'paid'
AND admin_notes LIKE '%تم الإصلاح التلقائي عبر pg_cron%'
AND updated_at > (now() - interval '1 minute');

-- Step 7: Performance and monitoring info
-- ══════ 7. معلومات الأداء والمراقبة ══════
SELECT '══════ 7. معلومات الأداء والمراقبة ══════' as verification_step;

-- Show next scheduled run time
SELECT
    jobname,
    schedule,
    CASE
        WHEN active THEN 'Next run: within 1 hour (top of next hour)'
        ELSE 'Job is INACTIVE'
    END as next_run_info
FROM cron.job
WHERE jobname = 'fix-stuck-approved-requests';

-- Show database timezone
SELECT
    current_setting('timezone') as db_timezone,
    now() as db_current_time,
    now() AT TIME ZONE 'Asia/Riyadh' as riyadh_time;

-- Step 8: Health check summary
-- ══════ 8. ملخص الحالة العامة ══════
SELECT '══════ 8. ملخص الحالة العامة ══════' as verification_step;

WITH health_check AS (
    SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') as extension_ok,
        EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'fix_stuck_approved_requests') as function_ok,
        EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'fix-stuck-approved-requests' AND active) as job_ok,
        (SELECT COUNT(*) FROM publish_requests
         WHERE status = 'approved' AND moyasar_payment_id IS NOT NULL
         AND updated_at < (now() - interval '1 hour')) as stuck_count
)
SELECT
    CASE
        WHEN extension_ok AND function_ok AND job_ok
        THEN '🟢 HEALTHY: pg_cron setup is complete and active'
        WHEN extension_ok AND function_ok AND NOT job_ok
        THEN '🟡 WARNING: Setup complete but job is not active'
        WHEN extension_ok AND NOT function_ok
        THEN '🟠 WARNING: Extension installed but function missing'
        WHEN NOT extension_ok
        THEN '🔴 ERROR: pg_cron extension not installed'
        ELSE '🔴 UNKNOWN STATUS'
    END as overall_status,
    CASE
        WHEN stuck_count = 0 THEN '✅ No stuck requests found'
        WHEN stuck_count <= 3 THEN '⚠️ ' || stuck_count || ' stuck requests (acceptable)'
        ELSE '❌ ' || stuck_count || ' stuck requests (requires attention)'
    END as stuck_requests_status
FROM health_check;

-- ═══════════════════════════════════════════
SELECT '✅ Verification complete!' as final_status;
SELECT 'If you see any ❌ or 🔴 indicators, check the setup instructions in supabase-pg-cron.sql' as next_steps;
-- ═══════════════════════════════════════════