-- ==================================================
-- حل طارئ - لإصلاح المشكلة فوراً
-- ==================================================

-- الحل الأول: تعطيل RLS مؤقتاً على جدول profiles
-- (يمكن إعادة تفعيله لاحقاً بعد إصلاح السياسات)

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- إبقاء RLS على publish_requests مُفعل مع سياسة مبسطة
ALTER TABLE publish_requests ENABLE ROW LEVEL SECURITY;

-- تنظيف سياسات publish_requests
DROP POLICY IF EXISTS "Users can view own requests" ON publish_requests;
DROP POLICY IF EXISTS "Users can update own requests" ON publish_requests;
DROP POLICY IF EXISTS "Users can insert own requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON publish_requests;
DROP POLICY IF EXISTS "Admins can update all requests" ON publish_requests;

-- سياسة مبسطة للطلبات
CREATE POLICY "Full access for authenticated users" ON publish_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================================================
-- نتيجة هذا الحل:
-- ✅ صلاحيات الإدارة ستعمل فوراً
-- ✅ نظام التفاوض سيعمل
-- ✅ لا توجد قيود على الوصول للبيانات
--
-- ⚠️ ملاحظة: هذا حل مؤقت للاختبار
-- ⚠️ يمكن إعادة تفعيل RLS لاحقاً عند الحاجة
-- ==================================================