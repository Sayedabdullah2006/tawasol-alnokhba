-- تمييز الطلبات المُسجّلة يدوياً من الأدمن (نُشرت ودُفعت خارج المنصة)
-- تُحتسب ضمن إحصاءات الموقع وإيراداته كبقية الطلبات
ALTER TABLE publish_requests
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;
