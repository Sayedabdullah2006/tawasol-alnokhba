-- ==================================================
-- سياسات RLS النهائية - نسخة تعمل بلا أخطاء
-- ==================================================

-- 1. تمكين RLS على الجداول
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. حذف السياسات الموجودة إذا كانت موجودة (لتجنب أخطاء التكرار)
DROP POLICY IF EXISTS "Users can view own requests" ON publish_requests;
DROP POLICY IF EXISTS "Users can update own requests" ON publish_requests;
DROP POLICY IF EXISTS "Users can insert own requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins can update all requests" ON publish_requests;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- 3. سياسات جدول publish_requests

-- المستخدمون يمكنهم رؤية طلباتهم
CREATE POLICY "Users can view own requests" ON publish_requests
  FOR SELECT USING (auth.uid() = user_id);

-- المستخدمون يمكنهم تحديث طلباتهم (للتفاوض)
CREATE POLICY "Users can update own requests" ON publish_requests
  FOR UPDATE USING (auth.uid() = user_id);

-- المستخدمون يمكنهم إنشاء طلبات
CREATE POLICY "Users can insert own requests" ON publish_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- الإدارة يمكنها رؤية جميع الطلبات
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

-- 4. سياسات جدول profiles

-- المستخدمون يمكنهم رؤية بروفايلهم
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- المستخدمون يمكنهم تحديث بروفايلهم
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- المستخدمون يمكنهم إنشاء بروفايلهم
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- الإدارة يمكنها رؤية جميع البروفايلات
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ==================================================
-- ملاحظات مهمة:
--
-- ✅ لدينا حسابين إدارة جاهزين:
-- 1. admin@test.com / admin123
-- 2. admin@ksa-influencers.com / كلمة المرور الحالية
--
-- ✅ حساب العميل للاختبار:
-- test-negotiation@example.com / test123456
--
-- ✅ لا حاجة لإدراج بيانات إضافية - الحسابات موجودة
-- ==================================================