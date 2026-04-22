-- جدولة التذكيرات بدون CRON_API خارجي
-- انسخ والصق هذا في Supabase Dashboard > SQL Editor

-- إنشاء دالة تشغيل التذكيرات اليومية
CREATE OR REPLACE FUNCTION trigger_daily_reminders()
RETURNS void AS $$
DECLARE
    result jsonb;
BEGIN
    -- استدعاء Edge Function للتذكيرات
    SELECT net.http_post(
        url := 'https://your-project-ref.supabase.co/functions/v1/daily-reminders',
        headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb,
        body := '{}'::jsonb
    ) INTO result;

    -- تسجيل النتيجة
    INSERT INTO cron_job_logs (job_name, executed_at, result, success)
    VALUES (
        'daily_reminders',
        NOW(),
        result,
        (result->>'status_code')::int BETWEEN 200 AND 299
    );

    RAISE NOTICE 'Daily reminders job executed: %', result;
END;
$$ LANGUAGE plpgsql;

-- إنشاء جدول سجلات الـ cron jobs
CREATE TABLE IF NOT EXISTS cron_job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name VARCHAR(100) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    result JSONB,
    success BOOLEAN DEFAULT FALSE
);

-- إنشاء فهرس للبحث
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_name_date
  ON cron_job_logs(job_name, executed_at DESC);

-- استخدام pg_cron إذا كان متاحاً (يحتاج تفعيل من الإدارة)
-- SELECT cron.schedule(
--     'daily-reminders',
--     '0 6 * * *',  -- يومياً الساعة 6 صباحاً UTC (9 صباحاً السعودية)
--     'SELECT trigger_daily_reminders();'
-- );

COMMENT ON FUNCTION trigger_daily_reminders() IS 'دالة تشغيل التذكيرات اليومية بدون API خارجي';
COMMENT ON TABLE cron_job_logs IS 'سجل تشغيل المهام المجدولة';