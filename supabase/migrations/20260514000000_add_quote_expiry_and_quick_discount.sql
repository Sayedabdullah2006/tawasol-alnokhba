-- إضافة صلاحية زمنية للعرض وخصم محدد المدة لتسريع القبول

ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_quick_discount_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS quote_quick_discount_deadline TIMESTAMPTZ;

COMMENT ON COLUMN publish_requests.quote_expires_at IS 'تاريخ انتهاء صلاحية العرض المرسل للعميل';
COMMENT ON COLUMN publish_requests.quote_quick_discount_pct IS 'نسبة الخصم (٪) للقبول السريع للعرض';
COMMENT ON COLUMN publish_requests.quote_quick_discount_deadline IS 'الموعد النهائي للاستفادة من خصم القبول السريع';
