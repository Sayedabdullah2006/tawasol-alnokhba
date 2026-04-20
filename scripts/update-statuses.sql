-- أضف الحالات الجديدة — نفّذ في SQL Editor
ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
  CHECK (status IN ('pending','approved','paid','in_progress','completed','rejected'));
