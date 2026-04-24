# 🔍 دليل استخدام سكربت التحقق من pg-cron

## كيفية تشغيل السكربت

### في Supabase SQL Editor (الطريقة الأساسية):
1. افتح SQL Editor في Supabase Dashboard
2. انسخ محتوى `verify-pg-cron.sql` وألصقه
3. اضغط Run لتنفيذ السكربت الكامل
4. راجع النتائج في كل قسم - ستظهر كـ Query Results منفصلة

⚠️ **ملاحظة هامة:** السكربت محسّن للعمل في Supabase SQL Editor بدون أوامر psql

### عبر psql (للمطورين المتقدمين):
```bash
psql "postgresql://user:pass@host:5432/dbname" -f verify-pg-cron.sql
```

## تفسير النتائج في Supabase

**في Supabase SQL Editor، ستحصل على نتائج متعددة - كل SELECT سيظهر نتيجة منفصلة:**

### 🟢 حالة صحية مثالية:
- ✅ pg_cron extension is installed
- ✅ fix_stuck_approved_requests() function exists  
- ✅ Job is active and scheduled
- ✅ No stuck requests found
- Recent executions show SUCCESS
- Overall status: "HEALTHY"

### ⚠️ تحذيرات تحتاج متابعة:
- Job exists but not active → تحقق من تفعيل الوظيفة
- Few stuck requests → مراقبة عادية، سيتم إصلاحها تلقائياً
- No recent executions → قد تكون الوظيفة جديدة

### 🔴 مشاكل تحتاج إصلاح فوري:
- Extension not installed → شغل `supabase-pg-cron.sql`
- Function missing → أعد إنشاء الدالة
- Many stuck requests → تدخل يدوي مطلوب

## الأقسام الرئيسية

### 1. فحص الامتداد
يتحقق من تثبيت pg_cron وصلاحيات الوصول

### 2. فحص الدالة  
يؤكد وجود دالة الإصلاح ومعاملاتها

### 3. فحص الوظائف المجدولة
يعرض الوظائف النشطة وجدولة التنفيذ

### 4. سجل التنفيذ
آخر 10 تنفيذات مع الأوقات والنتائج

### 5. الطلبات العالقة
عدد وتفاصيل الطلبات التي تحتاج إصلاح

### 6. اختبار يدوي
يشغل الدالة مباشرة لاختبار الوظيفة

### 7. معلومات الأداء
أوقات التشغيل التالية ومعلومات النطاق الزمني

### 8. ملخص الحالة
تقييم شامل لصحة النظام

## استكشاف الأخطاء الشائعة

### المشكلة: Extension not found
```sql
-- الحل:
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;
```

### المشكلة: Function missing  
```sql
-- الحل: نفذ كامل supabase-pg-cron.sql من البداية
```

### المشكلة: Job not active
```sql  
-- الحل:
SELECT cron.schedule(
  'fix-stuck-approved-requests',
  '0 * * * *', 
  $$SELECT fix_stuck_approved_requests()$$
);
```

### المشكلة: Many stuck requests
```sql
-- إصلاح فوري:
SELECT fix_stuck_approved_requests();
```

## مراقبة دورية

شغل هذا السكربت:
- ✅ يومياً في البداية للتأكد من الاستقرار
- ✅ أسبوعياً بعد الاستقرار  
- ✅ عند ملاحظة مشاكل دفع
- ✅ بعد أي تحديثات على قاعدة البيانات

## اختبار سريع (شغله أولاً)

```sql
-- فحص سريع للحالة العامة قبل تشغيل السكربت الكامل:
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'fix-stuck-approved-requests' AND active)
    THEN '🟢 HEALTHY - pg_cron working'
    WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    THEN '⚠️ WARNING - pg_cron installed but job missing'
    ELSE '🔴 ERROR - pg_cron not installed' 
  END as quick_status;
```

**إذا حصلت على 🟢 HEALTHY، شغل السكربت الكامل للمراجعة التفصيلية**  
**إذا حصلت على ⚠️ أو 🔴، راجع تعليمات التثبيت في `supabase-pg-cron.sql`**

## جهة الاتصال للمشاكل

إذا واجهت مشاكل غير مغطاة هنا:
1. راجع logs في `cron.job_run_details`
2. تحقق من Supabase logs
3. شغل الدالة يدوياً لاختبار المنطق
4. راجع صلاحيات قاعدة البيانات