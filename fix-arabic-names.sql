-- فحص وإصلاح مشكلة عرض الأسماء العربية
-- انسخ والصق في Supabase SQL Editor

-- 1. فحص البيانات الحالية
SELECT
    id,
    client_name,
    length(client_name) as name_length,
    client_email,
    created_at
FROM publish_requests
WHERE client_name IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- 2. فحص encoding (إذا كانت مشكلة في قاعدة البيانات)
SELECT
    client_name,
    encode(client_name::bytea, 'hex') as hex_data,
    client_name::text as display_name
FROM publish_requests
WHERE client_name LIKE '%نيرثؤملا%'
   OR client_name LIKE '%ريدم%'
LIMIT 5;

-- 3. تنظيف البيانات المشوهة (إذا وجدت)
/*
UPDATE publish_requests
SET client_name = 'مدير منصة المؤثرين'  -- الاسم الصحيح
WHERE client_name = 'نيرثؤملا ةصنم ريدم';  -- الاسم المشوه
*/

-- 4. إضافة check constraint لمنع البيانات المشوهة مستقبلاً
/*
ALTER TABLE publish_requests
ADD CONSTRAINT client_name_valid_arabic
CHECK (client_name ~ '^[؀-ۿݐ-ݿࢠ-ࣿ\s\w\-\.]+$' OR client_name IS NULL);
*/

-- ملاحظات:
-- - إذا ظهرت النتائج بشكل صحيح في SQL Editor، المشكلة في Frontend
-- - إذا ظهرت مشوهة في SQL Editor، المشكلة في Database
-- - hex_data يساعد في فهم encoding المستخدم