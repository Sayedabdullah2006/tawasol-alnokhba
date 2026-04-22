-- ==================================================
-- سكريبت SQL لمعالجة الطلبات العالقة
-- ==================================================

-- 1. عرض تحليل شامل للطلبات الحالية
SELECT
    'تحليل الطلبات الحالية' as report_section,
    status,
    COUNT(*) as count,
    MIN(created_at) as oldest_request,
    MAX(created_at) as newest_request
FROM publish_requests
GROUP BY status
ORDER BY
    CASE status
        WHEN 'negotiation' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'quoted' THEN 3
        ELSE 4
    END;

-- 2. طلبات التفاوض العالقة
SELECT
    '=== طلبات التفاوض العالقة ===' as section,
    id,
    client_name,
    client_email,
    admin_quoted_price,
    client_proposed_price,
    negotiation_reason,
    DATE_PART('day', NOW() - negotiation_requested_at) as days_since_negotiation,
    CASE
        WHEN DATE_PART('day', NOW() - negotiation_requested_at) > 7 THEN '🚨 عاجل'
        WHEN DATE_PART('day', NOW() - negotiation_requested_at) > 3 THEN '⚠️ مهم'
        ELSE '✅ حديث'
    END as priority
FROM publish_requests
WHERE status = 'negotiation'
ORDER BY negotiation_requested_at ASC;

-- 3. الطلبات المعلقة في pending لفترة طويلة
SELECT
    '=== طلبات pending قديمة ===' as section,
    id,
    client_name,
    client_email,
    title,
    DATE_PART('day', NOW() - created_at) as days_since_created
FROM publish_requests
WHERE status = 'pending'
    AND DATE_PART('day', NOW() - created_at) > 7
ORDER BY created_at ASC;

-- 4. عروض الأسعار القديمة بدون رد
SELECT
    '=== عروض أسعار قديمة ===' as section,
    id,
    client_name,
    client_email,
    admin_quoted_price,
    DATE_PART('day', NOW() - updated_at) as days_since_quote
FROM publish_requests
WHERE status = 'quoted'
    AND DATE_PART('day', NOW() - updated_at) > 14
ORDER BY updated_at ASC;

-- ==================================================
-- إجراءات معالجة (نفذ حسب الحاجة)
-- ==================================================

-- 5. تحديث timestamps للطلبات القديمة
-- UPDATE publish_requests
-- SET
--     updated_at = NOW(),
--     admin_notes = COALESCE(admin_notes || ' | ', '') || 'تم تحديث الطلب آلياً - ' || NOW()::date
-- WHERE status IN ('pending', 'quoted')
--     AND DATE_PART('day', NOW() - updated_at) > 30;

-- 6. إضافة ملاحظات لطلبات التفاوض القديمة
-- UPDATE publish_requests
-- SET admin_notes = COALESCE(admin_notes || ' | ', '') || 'طلب تفاوض يحتاج متابعة عاجلة'
-- WHERE status = 'negotiation'
--     AND DATE_PART('day', NOW() - negotiation_requested_at) > 7
--     AND (admin_notes IS NULL OR admin_notes NOT LIKE '%يحتاج متابعة عاجلة%');

-- 7. إحصائيات مفصلة للمتابعة
SELECT
    '=== إحصائيات للمتابعة ===' as section,
    'طلبات تفاوض تحتاج رد فوري' as category,
    COUNT(*) as count
FROM publish_requests
WHERE status = 'negotiation'
    AND DATE_PART('day', NOW() - negotiation_requested_at) > 3

UNION ALL

SELECT
    '=== إحصائيات للمتابعة ===' as section,
    'طلبات pending متأخرة' as category,
    COUNT(*) as count
FROM publish_requests
WHERE status = 'pending'
    AND DATE_PART('day', NOW() - created_at) > 7

UNION ALL

SELECT
    '=== إحصائيات للمتابعة ===' as section,
    'عروض أسعار بلا رد' as category,
    COUNT(*) as count
FROM publish_requests
WHERE status = 'quoted'
    AND DATE_PART('day', NOW() - updated_at) > 14;

-- 8. قائمة أولويات العمل
SELECT
    '=== قائمة المهام ===' as section,
    CASE
        WHEN status = 'negotiation' AND DATE_PART('day', NOW() - negotiation_requested_at) > 3
        THEN '🔴 عاجل: رد على تفاوض ' || client_name

        WHEN status = 'pending' AND DATE_PART('day', NOW() - created_at) > 7
        THEN '🟡 مهم: مراجعة طلب ' || client_name

        WHEN status = 'quoted' AND DATE_PART('day', NOW() - updated_at) > 14
        THEN '🟠 متابعة: عرض سعر ' || client_name

        ELSE '✅ طبيعي'
    END as task,

    'http://localhost:3000/admin/requests/' || id as admin_link,

    DATE_PART('day',
        NOW() - COALESCE(negotiation_requested_at, updated_at, created_at)
    ) as days_waiting

FROM publish_requests
WHERE status IN ('negotiation', 'pending', 'quoted')
    AND (
        (status = 'negotiation' AND DATE_PART('day', NOW() - negotiation_requested_at) > 3)
        OR (status = 'pending' AND DATE_PART('day', NOW() - created_at) > 7)
        OR (status = 'quoted' AND DATE_PART('day', NOW() - updated_at) > 14)
    )
ORDER BY
    CASE
        WHEN status = 'negotiation' THEN 1
        WHEN status = 'pending' THEN 2
        WHEN status = 'quoted' THEN 3
    END,
    days_waiting DESC;

-- ==================================================
-- تعليمات الاستخدام:
-- 1. انسخ والصق في Supabase SQL Editor
-- 2. شغّل للحصول على تقرير شامل
-- 3. نفذ إجراءات المعالجة حسب الحاجة
-- 4. استخدم الروابط للانتقال المباشر للطلبات
-- ==================================================