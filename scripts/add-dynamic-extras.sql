-- جدول المزايا الإضافية الديناميكي — نفّذ في SQL Editor

CREATE TABLE IF NOT EXISTS extras (
  id text PRIMARY KEY,
  name_ar text NOT NULL,
  icon text NOT NULL DEFAULT '📋',
  default_price numeric NOT NULL DEFAULT 0,
  category_only text,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_extras" ON extras FOR SELECT USING (true);
CREATE POLICY "admin_manage_extras" ON extras FOR ALL USING (is_admin());

INSERT INTO extras (id, name_ar, icon, default_price, category_only, sort_order) VALUES
('bilingual', 'صياغة المحتوى باللغتين', '✍️', 300, null, 1),
('mention', 'منشن في القناة', '🔔', 200, null, 2),
('story', 'ستوري في القناة', '📱', 150, null, 3),
('encyclopedia', 'إضافة للموسوعة الرقمية', '📖', 500, null, 4),
('pin6', 'تثبيت 6 أشهر', '📌', 100, null, 5),
('pin12', 'تثبيت 12 شهر', '📍', 200, null, 6),
('repost', 'إعادة نشر', '🔄', 150, null, 7),
('campaign', 'حملة ترويجية متكاملة', '📣', 1000, null, 8),
('video', 'فيديو جاهز', '🎬', 400, null, 9),
('report', 'تقرير الأداء', '📊', 800, null, 10),
('plan', 'خطة تسويقية شاملة', '🗺️', 1500, null, 11),
('website', 'تصميم موقع إلكتروني', '🌐', 5000, null, 12),
('media', 'تغطية إعلامية', '📺', 10000, null, 13),
('infographic', 'تصميم انفوجرافيك', '🎨', 300, 'cv', 14)
ON CONFLICT (id) DO NOTHING;
