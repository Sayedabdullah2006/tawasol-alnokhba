-- =============================================================================
-- SQL Setup Script للنشر المباشر في Supabase
-- انسخ والصق هذا في Supabase Dashboard > SQL Editor > New Query
-- =============================================================================

-- 1. إنشاء جدول تسجيل التذكيرات
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES publish_requests(id) ON DELETE CASCADE,
  client_email VARCHAR(255) NOT NULL,
  reminder_type VARCHAR(50) NOT NULL, -- quoted, approved, content_review
  reminder_number INTEGER NOT NULL, -- 1, 2, 3, etc.
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  email_subject TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- إضافة فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_request_id
  ON email_reminder_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_reminder_type
  ON email_reminder_logs(reminder_type);
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_sent_at
  ON email_reminder_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_request_type
  ON email_reminder_logs(request_id, reminder_type);

-- تعليقات للجدول
COMMENT ON TABLE email_reminder_logs IS 'سجل التذكيرات المرسلة عبر البريد الإلكتروني للعملاء';
COMMENT ON COLUMN email_reminder_logs.request_id IS 'معرف الطلب المرتبط بالتذكير';
COMMENT ON COLUMN email_reminder_logs.reminder_type IS 'نوع التذكير (quoted, approved, content_review)';

-- 2. إضافة عمود last_status_change إذا لم يكن موجوداً
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'publish_requests'
        AND column_name = 'last_status_change'
    ) THEN
        ALTER TABLE publish_requests
        ADD COLUMN last_status_change TIMESTAMP WITH TIME ZONE;

        -- تحديث السجلات الموجودة
        UPDATE publish_requests
        SET last_status_change = created_at
        WHERE last_status_change IS NULL;

        COMMENT ON COLUMN publish_requests.last_status_change IS 'تاريخ آخر تغيير في حالة الطلب';
        CREATE INDEX IF NOT EXISTS idx_publish_requests_last_status_change
          ON publish_requests(last_status_change);

        RAISE NOTICE 'تمت إضافة عمود last_status_change وتحديث البيانات الموجودة';
    ELSE
        RAISE NOTICE 'عمود last_status_change موجود بالفعل';
    END IF;
END $$;

-- 3. إنشاء دالة تحديث last_status_change تلقائياً
-- =============================================================================
CREATE OR REPLACE FUNCTION update_last_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.last_status_change = NOW();
        RAISE NOTICE 'تم تحديث last_status_change للطلب % من % إلى %',
                     NEW.id, OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger إذا لم يكن موجوداً
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_update_last_status_change'
    ) THEN
        CREATE TRIGGER trigger_update_last_status_change
            BEFORE UPDATE ON publish_requests
            FOR EACH ROW
            EXECUTE FUNCTION update_last_status_change();
        RAISE NOTICE 'تم إنشاء trigger لتحديث last_status_change تلقائياً';
    ELSE
        RAISE NOTICE 'trigger update_last_status_change موجود بالفعل';
    END IF;
END $$;

-- 4. إنشاء view للإحصائيات السريعة
-- =============================================================================
CREATE OR REPLACE VIEW email_reminder_stats AS
SELECT
  reminder_type,
  COUNT(*) as total_sent,
  COUNT(DISTINCT request_id) as unique_requests,
  COUNT(DISTINCT client_email) as unique_clients,
  DATE(sent_at) as sent_date
FROM email_reminder_logs
GROUP BY reminder_type, DATE(sent_at)
ORDER BY sent_date DESC, reminder_type;

COMMENT ON VIEW email_reminder_stats IS 'إحصائيات سريعة للتذكيرات المرسلة يومياً حسب النوع';

-- 5. إعداد Row Level Security
-- =============================================================================
ALTER TABLE email_reminder_logs ENABLE ROW LEVEL SECURITY;

-- سياسة للـ service role
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'email_reminder_logs'
        AND policyname = 'Allow service role full access to email_reminder_logs'
    ) THEN
        CREATE POLICY "Allow service role full access to email_reminder_logs" ON email_reminder_logs
          FOR ALL USING (auth.role() = 'service_role');
        RAISE NOTICE 'تم إنشاء RLS policy لجدول email_reminder_logs';
    END IF;
END $$;

-- 6. إنشاء دالة للحصول على الطلبات التي تحتاج تذكيرات
-- =============================================================================
CREATE OR REPLACE FUNCTION get_requests_needing_reminders()
RETURNS TABLE(
    id UUID,
    request_number INTEGER,
    client_name VARCHAR,
    client_email VARCHAR,
    status VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE,
    last_status_change TIMESTAMP WITH TIME ZONE,
    admin_quoted_price INTEGER,
    final_total INTEGER,
    reminder_count BIGINT,
    days_since_change INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pr.id,
        pr.request_number,
        pr.client_name,
        pr.client_email,
        pr.status,
        pr.created_at,
        pr.last_status_change,
        pr.admin_quoted_price,
        pr.final_total,
        COALESCE(COUNT(erl.id), 0) as reminder_count,
        EXTRACT(days FROM (NOW() - COALESCE(pr.last_status_change, pr.created_at)))::INTEGER as days_since_change
    FROM publish_requests pr
    LEFT JOIN email_reminder_logs erl ON pr.id = erl.request_id AND erl.reminder_type = pr.status
    WHERE pr.status IN ('quoted', 'approved', 'content_review')
        AND pr.client_email IS NOT NULL
        AND pr.client_email != ''
    GROUP BY pr.id, pr.request_number, pr.client_name, pr.client_email,
             pr.status, pr.created_at, pr.last_status_change,
             pr.admin_quoted_price, pr.final_total
    ORDER BY pr.last_status_change ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_requests_needing_reminders() IS 'إرجاع الطلبات التي قد تحتاج تذكيرات مع الإحصائيات';

-- =============================================================================
-- انتهاء إعداد قاعدة البيانات
-- =============================================================================

-- رسالة نجاح
DO $$
BEGIN
    RAISE NOTICE '🎉 تم إعداد قاعدة البيانات بنجاح!';
    RAISE NOTICE '✅ جدول email_reminder_logs جاهز';
    RAISE NOTICE '✅ عمود last_status_change مُضاف';
    RAISE NOTICE '✅ Triggers للتحديث التلقائي جاهزة';
    RAISE NOTICE '✅ RLS policies مُعدة';
    RAISE NOTICE '✅ دوال مساعدة جاهزة';
    RAISE NOTICE '';
    RAISE NOTICE 'الخطوة التالية: إنشاء Edge Functions في Dashboard';
END $$;