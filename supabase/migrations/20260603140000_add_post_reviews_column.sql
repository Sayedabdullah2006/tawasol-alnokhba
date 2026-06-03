-- مراجعة المحتوى لكل منشور على حدة (لكل خبر في الحملة، أو الخبر الواحد للطلب المفرد).
-- كائن JSON مفتاحه فهرس المنشور (0,1,2...) وقيمته حالة مراجعة ذلك المنشور:
-- {
--   proposed_content: نص المحتوى المُرسل,
--   proposed_images: التصاميم المُرسلة [],
--   selected_image: التصميم الذي اعتمده العميل | null,
--   status: 'content_review' | 'approved' | 'changes_requested',
--   user_feedback: ملاحظات العميل | null,
--   content_sent_at, content_approved_at, feedback_sent_at
-- }
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS post_reviews jsonb;
