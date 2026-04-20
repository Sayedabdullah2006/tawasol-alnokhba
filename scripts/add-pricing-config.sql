-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- جدول إعدادات التسعير الديناميكي
-- نفّذ في SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS pricing_config (
  id text PRIMARY KEY DEFAULT 'default',
  base_prices jsonb NOT NULL DEFAULT '{}',
  extras_prices jsonb NOT NULL DEFAULT '{}',
  scope_multipliers jsonb NOT NULL DEFAULT '{"single":1.0,"all":1.5}',
  image_multipliers jsonb NOT NULL DEFAULT '{"one":1.0,"multi":1.2}',
  discount_table jsonb NOT NULL DEFAULT '{"1":0,"2":5,"3":10,"4":15,"5":20,"6":25,"7":30,"8":35,"9":40,"10":45}',
  max_discount numeric NOT NULL DEFAULT 50,
  vat_rate numeric NOT NULL DEFAULT 0.15,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read pricing
CREATE POLICY "anyone_read_pricing" ON pricing_config
  FOR SELECT USING (true);

-- Only admin can update
CREATE POLICY "admin_update_pricing" ON pricing_config
  FOR ALL USING (is_admin());

-- Insert default config
INSERT INTO pricing_config (id, base_prices, extras_prices) VALUES (
  'default',
  '{"inventions":3000,"competitions":3000,"books":1200,"events":2500,"certs":800,"graduation":600,"appointment":1500,"award":2000,"cv":900,"product":3000,"research":500,"charity":400,"government":4500}',
  '{"bilingual":300,"mention":200,"story":150,"encyclopedia":500,"pin6":100,"pin12":200,"repost":150,"campaign":1000,"video":400,"report":800,"plan":1500,"website":5000,"media":10000,"infographic":300}'
) ON CONFLICT (id) DO NOTHING;
