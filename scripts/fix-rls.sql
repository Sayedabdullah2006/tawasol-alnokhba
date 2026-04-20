-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- إصلاح سياسات RLS — نفّذ في SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. حذف السياسات القديمة
DROP POLICY IF EXISTS "users_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;

-- 2. سياسة المستخدم — يقرأ ويعدل ملفه فقط
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- 3. سياسة الأدمن — يقرأ كل الملفات (بدون recursion)
-- نستخدم auth.jwt() بدل query على profiles
CREATE POLICY "admin_read_all_profiles" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- في الواقع، المشكلة هي أن السياسة تقرأ من نفس الجدول
-- الحل: نستخدم SECURITY DEFINER function

-- أولاً: إنشاء دالة آمنة لفحص الدور
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- حذف كل السياسات وإعادة إنشائها
DROP POLICY IF EXISTS "users_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;

-- المستخدم يرى ملفه + الأدمن يرى الكل
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

-- المستخدم يعدل ملفه فقط
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- المستخدم يدخل ملفه فقط (أو service role)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ━━ نفس الشيء لجدول publish_requests ━━

DROP POLICY IF EXISTS "users_see_own_requests" ON publish_requests;
DROP POLICY IF EXISTS "anyone_can_insert_request" ON publish_requests;
DROP POLICY IF EXISTS "admin_all_requests" ON publish_requests;

CREATE POLICY "requests_select" ON publish_requests
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "requests_insert" ON publish_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "requests_update" ON publish_requests
  FOR UPDATE USING (is_admin());

CREATE POLICY "requests_delete" ON publish_requests
  FOR DELETE USING (is_admin());

-- ━━ نفس الشيء لجدول influencers ━━

DROP POLICY IF EXISTS "anyone_read_active_influencers" ON influencers;
DROP POLICY IF EXISTS "admin_all_influencers" ON influencers;

-- الكل يقرأ المؤثرين المفعلين
CREATE POLICY "influencers_select" ON influencers
  FOR SELECT USING (is_active = true OR is_admin());

CREATE POLICY "influencers_insert" ON influencers
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "influencers_update" ON influencers
  FOR UPDATE USING (is_admin());

CREATE POLICY "influencers_delete" ON influencers
  FOR DELETE USING (is_admin());
