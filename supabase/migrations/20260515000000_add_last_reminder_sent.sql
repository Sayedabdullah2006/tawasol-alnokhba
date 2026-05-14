-- تتبّع آخر مرة أُرسل فيها تذكير للعميل لطلب معيّن

ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;

COMMENT ON COLUMN publish_requests.last_reminder_sent IS 'وقت آخر تذكير أُرسل للعميل (للإرسال الفردي والجماعي)';
