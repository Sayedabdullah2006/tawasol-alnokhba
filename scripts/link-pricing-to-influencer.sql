-- ربط التسعير بالمؤثر — نفّذ في SQL Editor

-- 1. إضافة عمود influencer_id
ALTER TABLE pricing_config ADD COLUMN IF NOT EXISTS influencer_id uuid REFERENCES influencers(id) ON DELETE CASCADE;

-- 2. إنشاء index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_pricing_influencer ON pricing_config(influencer_id);

-- 3. نسخ الإعدادات الافتراضية للمؤثر الموجود
INSERT INTO pricing_config (id, influencer_id, base_prices, extras_prices, scope_multipliers, image_multipliers, discount_table, max_discount, vat_rate)
SELECT
  'inf_' || id,
  id,
  (SELECT base_prices FROM pricing_config WHERE id = 'default'),
  (SELECT extras_prices FROM pricing_config WHERE id = 'default'),
  (SELECT scope_multipliers FROM pricing_config WHERE id = 'default'),
  (SELECT image_multipliers FROM pricing_config WHERE id = 'default'),
  (SELECT discount_table FROM pricing_config WHERE id = 'default'),
  (SELECT max_discount FROM pricing_config WHERE id = 'default'),
  (SELECT vat_rate FROM pricing_config WHERE id = 'default')
FROM influencers
WHERE NOT EXISTS (SELECT 1 FROM pricing_config WHERE influencer_id = influencers.id)
ON CONFLICT (id) DO NOTHING;
