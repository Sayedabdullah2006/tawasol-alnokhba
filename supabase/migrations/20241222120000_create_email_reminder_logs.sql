-- جدول لتتبع تذكيرات البريد الإلكتروني المرسلة
-- Email reminder logs to track sent reminders and prevent duplicates

CREATE TABLE IF NOT EXISTS email_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- معلومات الطلب
  request_id UUID NOT NULL REFERENCES publish_requests(id) ON DELETE CASCADE,
  client_email VARCHAR(255) NOT NULL,

  -- نوع التذكير والرقم التسلسلي
  reminder_type VARCHAR(50) NOT NULL, -- quoted, approved, content_review
  reminder_number INTEGER NOT NULL, -- 1, 2, 3, etc.

  -- معلومات الإرسال
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  email_subject TEXT,

  -- فهرسة للبحث السريع
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- فهارس للأداء الأمثل
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_request_id
  ON email_reminder_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_reminder_type
  ON email_reminder_logs(reminder_type);

CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_sent_at
  ON email_reminder_logs(sent_at);

-- فهرس مركب للبحث عن التذكيرات لطلب معين
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_request_type
  ON email_reminder_logs(request_id, reminder_type);

-- تعليق على الجدول
COMMENT ON TABLE email_reminder_logs IS 'سجل التذكيرات المرسلة عبر البريد الإلكتروني للعملاء';
COMMENT ON COLUMN email_reminder_logs.request_id IS 'معرف الطلب المرتبط بالتذكير';
COMMENT ON COLUMN email_reminder_logs.client_email IS 'بريد العميل الذي أُرسل إليه التذكير';
COMMENT ON COLUMN email_reminder_logs.reminder_type IS 'نوع التذكير (quoted, approved, content_review)';
COMMENT ON COLUMN email_reminder_logs.reminder_number IS 'الرقم التسلسلي للتذكير (1, 2, 3...)';
COMMENT ON COLUMN email_reminder_logs.sent_at IS 'تاريخ ووقت إرسال التذكير';
COMMENT ON COLUMN email_reminder_logs.email_subject IS 'عنوان البريد الإلكتروني المرسل';

-- إعطاء صلاحيات للخدمة
ALTER TABLE email_reminder_logs ENABLE ROW LEVEL SECURITY;

-- سياسة RLS: السماح للخدمة بالقراءة والكتابة
CREATE POLICY "Allow service role full access to email_reminder_logs" ON email_reminder_logs
  FOR ALL USING (auth.role() = 'service_role');

-- إحصائيات سريعة للمراقبة
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