-- حفظ حالة استوديو الذكاء الاصطناعي حتى لا تضيع عند إعادة تحميل الصفحة:
-- ai_designs: التصاميم المولّدة للطلب المفرد [{ title, imageUrl, brief }]
-- ai_uploaded_images: صور المصدر التي رفعها الأدمن يدوياً للطلب المفرد []
-- (للحملات تُحفظ داخل ai_posts[index].designs و ai_posts[index].uploaded_images)
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS ai_designs jsonb,
  ADD COLUMN IF NOT EXISTS ai_uploaded_images jsonb;
