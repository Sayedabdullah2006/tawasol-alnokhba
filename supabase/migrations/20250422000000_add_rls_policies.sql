-- إضافة سياسات Row Level Security لجدول publish_requests

-- تمكين RLS على الجدول
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;

-- سياسة قراءة البيانات
CREATE POLICY "Users can view their own requests" ON publish_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- سياسة إنشاء طلبات جديدة
CREATE POLICY "Users can create their own requests" ON publish_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- سياسة تحديث الطلبات (العميل يمكنه تحديث طلباته الخاصة)
CREATE POLICY "Users can update their own requests" ON publish_requests
  FOR UPDATE
  USING (auth.uid() = user_id);

-- سياسة للإدارة - قراءة جميع الطلبات
CREATE POLICY "Admins can view all requests" ON publish_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- سياسة للإدارة - تحديث جميع الطلبات
CREATE POLICY "Admins can update all requests" ON publish_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- تمكين RLS على جدول profiles أيضاً
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- سياسة قراءة البروفايل الشخصي
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- سياسة تحديث البروفايل الشخصي
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- سياسة إنشاء البروفايل
CREATE POLICY "Users can create own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- سياسة للإدارة - قراءة جميع البروفايلات
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- إنشاء بروفايل إدارة افتراضي للاختبار
INSERT INTO profiles (id, email, role, full_name)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'admin@test.com',
  'admin',
  'مدير النظام'
) ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  email = 'admin@test.com';

-- إنشاء مستخدم إدارة في auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111'::uuid,
  'authenticated',
  'authenticated',
  'admin@test.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  ''
) ON CONFLICT (id) DO UPDATE SET
  email = 'admin@test.com',
  encrypted_password = crypt('admin123', gen_salt('bf'));

-- تعليقات لتوثيق السياسات
COMMENT ON POLICY "Users can view their own requests" ON publish_requests IS 'المستخدمون يمكنهم رؤية طلباتهم الخاصة فقط';
COMMENT ON POLICY "Admins can view all requests" ON publish_requests IS 'الإدارة يمكنها رؤية جميع الطلبات';
COMMENT ON POLICY "Users can update their own requests" ON publish_requests IS 'المستخدمون يمكنهم تحديث طلباتهم الخاصة فقط';
COMMENT ON POLICY "Admins can update all requests" ON publish_requests IS 'الإدارة يمكنها تحديث جميع الطلبات';