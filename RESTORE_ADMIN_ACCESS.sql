-- ==================================================
-- إصلاح صلاحيات الإدارة بعد تطبيق RLS
-- ==================================================

-- 1. تعطيل RLS مؤقتاً للإصلاح (فقط للضرورة)
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 2. التأكد من وجود بروفايلات الإدارة وصحتها
UPDATE profiles
SET role = 'admin', full_name = 'مدير منصة المؤثرين'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@ksa-influencers.com'
);

UPDATE profiles
SET role = 'admin', full_name = 'مدير النظام'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@test.com'
);

-- 3. إضافة سياسة خاصة للإدارة للوصول للبروفايلات
DROP POLICY IF EXISTS "Service role access" ON profiles;
CREATE POLICY "Service role access" ON profiles
  FOR ALL
  TO service_role
  USING (true);

-- 4. إضافة سياسة للإدارة للوصول لجميع البروفايلات
DROP POLICY IF EXISTS "Admins can access all profiles" ON profiles;
CREATE POLICY "Admins can access all profiles" ON profiles
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- 5. إضافة سياسة للإدارة للوصول لجميع الطلبات
DROP POLICY IF EXISTS "Admins full access to requests" ON publish_requests;
CREATE POLICY "Admins full access to requests" ON publish_requests
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- 6. التأكد من تمكين RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;

-- 7. عرض النتائج للتأكد
SELECT
  u.email,
  p.role,
  p.full_name,
  'تم التحديث' as status
FROM auth.users u
JOIN profiles p ON u.id = p.id
WHERE u.email IN ('admin@ksa-influencers.com', 'admin@test.com');

-- ==================================================
-- ملاحظات:
-- 1. طبق هذا السكريبت في Supabase Dashboard
-- 2. سيصلح صلاحيات الإدارة
-- 3. يضمن الوصول لجميع البيانات
-- ==================================================