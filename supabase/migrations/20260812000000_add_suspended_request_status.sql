-- حالة تعليق داخلية: تحفظ المرحلة السابقة لاستئناف الطلب دون مراسلة العميل.
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS suspended_from_status text;

ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'quoted'::text, 'client_rejected'::text, 'negotiation'::text,
    'approved'::text, 'payment_review'::text, 'paid'::text, 'in_progress'::text,
    'info_requested'::text, 'content_review'::text, 'changes_requested'::text,
    'scheduled'::text, 'suspended'::text, 'completed'::text, 'rejected'::text,
    'auto_closed'::text, 'cancelled'::text
  ]));
