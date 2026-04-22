-- إصلاح سريع للأسماء المعكوسة الشائعة
-- انسخ والصق في Supabase SQL Editor

-- 1. فحص الأسماء الحالية
SELECT DISTINCT client_name
FROM publish_requests
WHERE client_name IS NOT NULL
ORDER BY client_name;

-- 2. إصلاح الأسماء المعكوسة الشائعة
UPDATE publish_requests
SET client_name = CASE
    WHEN client_name = 'نيرثؤملا ةصنم ريدم' THEN 'مدير منصة المؤثرين'
    WHEN client_name = 'ريدم ةصنم نيرثؤملا' THEN 'مدير منصة المؤثرين'
    WHEN client_name = 'ريدم' THEN 'مدير'
    WHEN client_name = 'ةصنم' THEN 'منصة'
    WHEN client_name = 'نيرثؤملا' THEN 'المؤثرين'
    WHEN client_name = 'ليمعلا' THEN 'العميل'
    WHEN client_name = 'لجرلا' THEN 'الرجل'
    WHEN client_name = 'ةأرملا' THEN 'المرأة'
    ELSE client_name
END
WHERE client_name IN (
    'نيرثؤملا ةصنم ريدم', 'ريدم ةصنم نيرثؤملا', 'ريدم',
    'ةصنم', 'نيرثؤملا', 'ليمعلا', 'لجرلا', 'ةأرملا'
);

-- 3. فحص النتائج
SELECT client_name, COUNT(*) as count
FROM publish_requests
WHERE client_name IS NOT NULL
GROUP BY client_name
ORDER BY client_name;