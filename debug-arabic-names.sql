-- فحص عميق لمشكلة النصوص العربية
-- انسخ والصق في Supabase SQL Editor ونفذ كل قسم منفصل

-- 1. فحص تفصيلي للبيانات
SELECT
    id,
    client_name,
    LENGTH(client_name) as char_count,
    OCTET_LENGTH(client_name) as byte_count,
    ASCII(LEFT(client_name, 1)) as first_char_ascii,
    SUBSTRING(client_name, 1, 10) as first_10_chars
FROM publish_requests
WHERE client_name IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

-- 2. فحص encoding بالتفصيل
SELECT
    client_name,
    encode(client_name::bytea, 'escape') as escaped_text,
    encode(client_name::bytea, 'hex') as hex_encoding,
    CASE
        WHEN client_name ~ '[؀-ۿ]' THEN 'Contains Arabic'
        WHEN client_name ~ '[a-zA-Z]' THEN 'Contains Latin'
        ELSE 'Unknown script'
    END as script_type
FROM publish_requests
WHERE client_name IS NOT NULL
LIMIT 5;

-- 3. إصلاح البيانات المعكوسة (نفذ فقط إذا وجدت بيانات معكوسة)
/*
-- مثال لإصلاح نص معكوس
UPDATE publish_requests
SET client_name = REVERSE(client_name)
WHERE client_name LIKE '%نيرثؤملا%'
   OR client_name LIKE '%ةصنم%'
   OR client_name LIKE '%ريدم%';
*/

-- 4. تنظيف البيانات المشوهة وإعادة كتابتها بالشكل الصحيح
/*
UPDATE publish_requests
SET client_name = 'مدير منصة المؤثرين'
WHERE client_name IN ('نيرثؤملا ةصنم ريدم', 'مدير منصة المؤثرين', 'ريدم ةصنم نيرثؤملا');

-- أضف هنا باقي الأسماء المشوهة والصحيحة
*/

-- 5. عرض النتائج بعد الإصلاح
SELECT
    client_name,
    created_at
FROM publish_requests
WHERE client_name IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;