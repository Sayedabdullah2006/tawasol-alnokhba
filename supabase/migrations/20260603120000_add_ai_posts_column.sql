-- تخزين حالة استوديو الذكاء الاصطناعي لكل منشور في الحملات متعددة المنشورات.
-- كائن JSON مفتاحه فهرس المنشور (0,1,2...) وقيمته مخرجات الخطوات الأربع لذلك المنشور:
-- { analysis, tweets, design_concepts, chosen_concept, image_prompt, source_image, image_url, generated_at }
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS ai_posts jsonb;
