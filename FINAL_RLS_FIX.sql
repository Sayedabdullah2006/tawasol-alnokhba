-- ==================================================
-- الحل النهائي: تطبيق سياسات RLS في Supabase Dashboard
-- ==================================================

-- 1. تمكين RLS على الجداول
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. سياسات جدول publish_requests

-- المستخدمون يمكنهم رؤية طلباتهم
CREATE POLICY "Users can view own requests" ON publish_requests
  FOR SELECT USING (auth.uid() = user_id);

-- المستخدمون يمكنهم تحديث طلباتهم (للتفاوض)
CREATE POLICY "Users can update own requests" ON publish_requests
  FOR UPDATE USING (auth.uid() = user_id);

-- المستخدمون يمكنهم إنشاء طلبات
CREATE POLICY "Users can insert own requests" ON publish_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- الإدارة تمكنها رؤية جميع الطلبات
CREATE POLICY "Admins can view all requests" ON publish_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- الإدارة يمكنها تحديث جميع الطلبات
CREATE POLICY "Admins can update all requests" ON publish_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 3. سياسات جدول profiles

-- المستخدمون يمكنهم رؤية بروفايلهم
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- المستخدمون يمكنهم تحديث بروفايلهم
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- المستخدمون يمكنهم إنشاء بروفايلهم
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. إنشاء حساب إدارة افتراضي
INSERT INTO profiles (id, email, role, full_name) VALUES
('11111111-1111-1111-1111-111111111111', 'admin@test.com', 'admin', 'مدير النظام')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ==================================================
-- تعليمات التطبيق:
-- 1. انتقل إلى https://supabase.com/dashboard
-- 2. اختر مشروعك
-- 3. انتقل إلى SQL Editor
-- 4. انسخ والصق الكود أعلاه
-- 5. اضغط RUN
-- ==================================================