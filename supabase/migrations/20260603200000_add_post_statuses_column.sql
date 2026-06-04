-- حالة نشر كل منشور في الحملة على حدة (قيد التنفيذ / مكتمل).
-- كائن JSON مفتاحه فهرس المنشور وقيمته 'in_progress' | 'completed'.
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS post_statuses jsonb;
