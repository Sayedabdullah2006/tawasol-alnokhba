-- فحص بنية جدول publish_requests لتحديد أسماء الأعمدة الصحيحة
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'publish_requests'
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- فحص عينة من البيانات لفهم التسميات المستخدمة
SELECT
    id,
    status,
    created_at,
    updated_at
FROM publish_requests
LIMIT 3;