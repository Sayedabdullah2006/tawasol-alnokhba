# دليل تشخيص مشكلة نظام التفاوض

## المشكلة المُبلغ عنها:
- بعد ضغط العميل على "طلب التفاوض على السعر" لا تتغير حالة الطلب
- صفحة الإدارة لا تُظهر خيارات التفاوض
- لا يمكن للإدارة الرد على العميل

## خطوات التشخيص:

### 1. التحقق من قاعدة البيانات
```bash
node debug-negotiation.js
```

### 2. التحقق من الـ Migration
```bash
npx supabase migration list
# تأكد من أن migration "20250101000000_fix_critical_workflow_columns" تم تطبيقه
```

### 3. اختبار API يدوياً

#### أ) اختبر طلب التفاوض:
```bash
curl -X POST http://localhost:3000/api/request-negotiation \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "YOUR_REQUEST_ID",
    "negotiationReason": "اختبار النظام",
    "proposedPrice": 1000
  }'
```

#### ب) تحقق من تحديث قاعدة البيانات:
```sql
SELECT id, status, negotiation_reason, client_proposed_price 
FROM publish_requests 
WHERE id = 'YOUR_REQUEST_ID';
```

### 4. فحص وحدة التحكم في المتصفح

1. افتح صفحة العميل التي تحتوي على عرض السعر
2. اضغط F12 لفتح Developer Tools
3. انتقل لتبويب "Console"
4. اضغط على "طلب التفاوض"
5. راقب أي رسائل خطأ

### 5. فحص صفحة الإدارة

1. انتقل إلى `/admin/requests/[REQUEST_ID]`
2. تأكد من أن الطلب في حالة `negotiation`
3. تحقق من ظهور القسم البرتقالي للتفاوض
4. فحص وحدة التحكم للأخطاء

## الحلول المحتملة:

### إذا كانت أعمدة التفاوض غير موجودة:
```bash
npx supabase db reset
# أو
npx supabase migration up
```

### إذا كان الـ Migration غير مُطبق:
```bash
npx supabase migration repair 20250101000000
npx supabase migration up
```

### إذا كانت المشكلة في البيانات:
```sql
-- تحديث حالة طلب للاختبار
UPDATE publish_requests 
SET status = 'negotiation', 
    negotiation_reason = 'اختبار النظام',
    client_proposed_price = 1000
WHERE id = 'YOUR_REQUEST_ID';
```

## نقاط فحص إضافية:

1. **تحقق من متغيرات البيئة:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **تحقق من صلاحيات RLS:**
   ```sql
   -- فحص السياسات
   SELECT * FROM pg_policies WHERE tablename = 'publish_requests';
   ```

3. **تحقق من حالة الخادم:**
   ```bash
   npm run dev
   # تأكد من عدم وجود أخطاء في بدء التشغيل
   ```

## إذا استمرت المشكلة:

1. أرسل نتائج `debug-negotiation.js`
2. أرسل لقطة شاشة من وحدة التحكم
3. أرسل لقطة شاشة من صفحة الإدارة
4. تأكد من الـ user role (يجب أن يكون 'admin')

## ملاحظات مهمة:

- تأكد من تسجيل الدخول كمدير لرؤية صفحة الإدارة
- تأكد من وجود طلب في حالة `quoted` للتمكن من التفاوض عليه
- تحقق من شبكة الإنترنت والاتصال بـ Supabase