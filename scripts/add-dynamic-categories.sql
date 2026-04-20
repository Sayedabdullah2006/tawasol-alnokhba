-- جدول الفئات الديناميكي — نفّذ في SQL Editor

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name_ar text NOT NULL,
  icon text NOT NULL DEFAULT '📋',
  description text,
  has_sub_option boolean DEFAULT false,
  sub_option_title text,
  sub_options jsonb,
  client_types jsonb,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_categories" ON categories FOR SELECT USING (true);
CREATE POLICY "admin_manage_categories" ON categories FOR ALL USING (is_admin());

INSERT INTO categories (id, name_ar, icon, description, has_sub_option, sub_option_title, sub_options, client_types, sort_order) VALUES
('inventions', 'الاختراعات', '💡', 'اختراع أو ابتكار جديد', true, 'هل لديك براءة اختراع؟', '[{"id":"with_patent","icon":"✅","label":"نعم — لدي براءة اختراع","hint":"سيُطبق إعفاء خاص"},{"id":"no_patent","icon":"❌","label":"لا — ليس لدي براءة","hint":"سيُطبق خصم خاص"}]', '["individual"]', 1),
('competitions', 'المسابقات', '🏆', 'فوز أو تميز في مسابقة', true, 'ما مركزك في المسابقة؟', '[{"id":"first_place","icon":"🥇","label":"المركز الأول","hint":"سيُطبق إعفاء خاص"},{"id":"other_place","icon":"🎖️","label":"مركز آخر","hint":"سيُطبق خصم خاص"}]', '["individual"]', 2),
('books', 'كتب ومصنفات', '📚', 'كتاب أو بحث أو مصنف', false, null, null, '["individual"]', 3),
('events', 'فعاليات ومؤتمرات', '🎯', 'مؤتمر أو معرض أو فعالية', false, null, null, null, 4),
('certs', 'شهادات احترافية', '🎖️', 'شهادة مهنية أو تخصصية', false, null, null, '["individual"]', 5),
('graduation', 'تهنئة تخرج', '🎓', 'تخرج أو إنجاز أكاديمي', false, null, null, '["individual"]', 6),
('appointment', 'تعيين منصب', '👔', 'تعيين أو ترقية مهنية', false, null, null, null, 7),
('award', 'جائزة خاصة', '🥇', 'جائزة أو تكريم', false, null, null, '["individual"]', 8),
('cv', 'سيرة ذاتية', '👤', 'ملف شخصي احترافي', false, null, null, '["individual"]', 9),
('product', 'منتج تجاري', '🚀', 'منتج أو خدمة تجارية', false, null, null, '["individual","business"]', 10),
('research', 'بحث علمي', '🔬', 'بحث أو دراسة علمية', false, null, null, '["individual"]', 11),
('charity', 'مبادرة خيرية', '❤️', 'مبادرة أو عمل خيري', false, null, null, '["charity"]', 12),
('government', 'إعلان حكومي', '🏛️', 'خدمة أو إعلان حكومي', false, null, null, '["government"]', 13)
ON CONFLICT (id) DO NOTHING;
