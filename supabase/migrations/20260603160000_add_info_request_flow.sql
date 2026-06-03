-- خاصية «طلب معلومات/صورة من العميل»:
-- عند عدم مناسبة الصورة أو الحاجة لمعلومات أكثر، يطلب الأدمن من العميل تعديل طلبه.
-- admin_info_request: نص رسالة الأدمن للعميل (ما المطلوب تعديله/إضافته)
-- info_requested_at: وقت الطلب
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS admin_info_request text,
  ADD COLUMN IF NOT EXISTS info_requested_at timestamptz;

-- إضافة حالة info_requested إلى قيد الحالة
ALTER TABLE publish_requests DROP CONSTRAINT IF EXISTS publish_requests_status_check;
ALTER TABLE publish_requests ADD CONSTRAINT publish_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'quoted'::text, 'client_rejected'::text, 'negotiation'::text,
    'approved'::text, 'payment_review'::text, 'paid'::text, 'in_progress'::text,
    'info_requested'::text, 'content_review'::text, 'completed'::text,
    'rejected'::text, 'auto_closed'::text
  ]));
