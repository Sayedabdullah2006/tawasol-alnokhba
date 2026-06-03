-- إصلاح فشل حفظ الطلب لطلبات الأفراد (منشور واحد)
--
-- العمود auto_quote_tier أصبح يُستخدم لتخزين مُعرّف الباقة المختارة
-- (basic / pro / elite) — كما تقرؤه صفحة الأدمن ولوحة التحكم.
-- لكن قيد الفحص القديم كان يسمح فقط بقيم تصنيف الخبر القديمة
-- ('شائع' / 'متميز' / 'استثنائي')، فكان إدراج مُعرّف الباقة يُخالف القيد
-- ويُفشل حفظ الطلب برسالة «فشل حفظ الطلب».
--
-- نوسّع القيد ليسمح بمُعرّفات الباقات (الاستخدام الحالي) مع الإبقاء على
-- قيم التصنيف القديمة توافقاً مع الصفوف الموجودة سابقاً، ومع السماح بـ NULL.

ALTER TABLE publish_requests
  DROP CONSTRAINT IF EXISTS publish_requests_auto_quote_tier_check;

ALTER TABLE publish_requests
  ADD CONSTRAINT publish_requests_auto_quote_tier_check
  CHECK (
    auto_quote_tier IS NULL
    OR auto_quote_tier IN (
      'basic', 'pro', 'elite',         -- مُعرّفات الباقات (الاستخدام الحالي)
      'شائع', 'متميز', 'استثنائي'       -- قيم تصنيف الخبر القديمة (توافقية)
    )
  );
