-- توليد تلقائي للخطوات 1-3 في استوديو الذكاء الاصطناعي عند دخول الطلب مرحلة التنفيذ.
-- ai_autogen_at: وقت تشغيل التوليد التلقائي (يمنع التكرار).
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS ai_autogen_at timestamptz;
