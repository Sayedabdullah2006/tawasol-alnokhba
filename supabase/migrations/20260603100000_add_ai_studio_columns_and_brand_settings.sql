-- أعمدة استوديو الذكاء الاصطناعي على الطلبات (مخرجات الخطوات الأربع)
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS ai_tweets jsonb,
  ADD COLUMN IF NOT EXISTS ai_design_concepts jsonb,
  ADD COLUMN IF NOT EXISTS ai_chosen_concept jsonb,
  ADD COLUMN IF NOT EXISTS ai_image_prompt text,
  ADD COLUMN IF NOT EXISTS ai_source_image text,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz;

-- جدول إعدادات العلامة (صف واحد) — لتخزين رابط لوقو أول سعودي المستخدم في توليد التصاميم
CREATE TABLE IF NOT EXISTS brand_settings (
  id integer PRIMARY KEY DEFAULT 1,
  first1saudi_logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_settings_single_row CHECK (id = 1)
);

INSERT INTO brand_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE brand_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_settings_read ON brand_settings;
CREATE POLICY brand_settings_read ON brand_settings FOR SELECT USING (true);
