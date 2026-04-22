-- ==================================================
-- إصلاح عاجل لسياسات RLS - حل خطأ 500
-- ==================================================

-- 1. إزالة جميع السياسات الموجودة أولاً
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can access all profiles" ON profiles;
DROP POLICY IF EXISTS "Service role access" ON profiles;

DROP POLICY IF EXISTS "Users can view own requests" ON publish_requests;
DROP POLICY IF EXISTS "Users can update own requests" ON publish_requests;
DROP POLICY IF EXISTS "Users can insert own requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins can update all requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins full access to requests" ON publish_requests;

-- 2. سياسات جدول profiles مُبسطة وصحيحة

-- سياسة للوصول الكامل عبر Service Role
CREATE POLICY "Enable all for service role" ON profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- سياسة للمستخدمين لرؤية وتعديل بروفايلهم
CREATE POLICY "Users can manage own profile" ON profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- سياسة للإدارة لرؤية جميع البروفايلات
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role = 'admin'
    )
    OR auth.uid() = id
  );

-- 3. سياسات جدول publish_requests مُبسطة وصحيحة

-- سياسة للوصول الكامل عبر Service Role
CREATE POLICY "Enable all for service role" ON publish_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- سياسة للمستخدمين لرؤية وتعديل طلباتهم
CREATE POLICY "Users can manage own requests" ON publish_requests
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- سياسة للإدارة لرؤية وتعديل جميع الطلبات
CREATE POLICY "Admins can manage all requests" ON publish_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR auth.uid() = user_id
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR auth.uid() = user_id
  );

-- 4. التأكد من تمكين RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;

-- 5. إضافة سياسة مؤقتة للتشخيص (يمكن حذفها لاحقاً)
CREATE POLICY "Temporary full access for debugging" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- ==================================================
-- تعليمات:
-- 1. طبق هذا السكريبت في Supabase Dashboard
-- 2. اختبر تسجيل الدخول مرة أخرى
-- 3. إذا عمل، احذف السياسة المؤقتة:
-- DROP POLICY "Temporary full access for debugging" ON profiles;
-- ==================================================

-- عرض النتائج للتأكد
SELECT
  schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('profiles', 'publish_requests')
ORDER BY tablename, policyname;