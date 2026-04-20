-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- إنشاء حساب أدمن — نفّذ في SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. أصلح الـ trigger أولاً (أحياناً يسبب مشاكل)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'client')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. أنشئ المستخدم الأدمن
-- كلمة المرور: Admin@2025!
SELECT supabase_admin.create_user(
  '{"email": "admin@ksa-influencers.com", "password": "Admin@2025!", "email_confirm": true, "user_metadata": {"full_name": "مدير المنصة"}}'::jsonb
);
