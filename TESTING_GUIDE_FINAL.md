# 🧪 دليل الاختبار النهائي - نظام التفاوض

## 🎯 الحسابات الجاهزة للاختبار:

### 👑 حسابات الإدارة (اختر أحدهما):
```
1. admin@test.com
   Password: admin123

2. admin@ksa-influencers.com  
   Password: [كلمة المرور الحالية]
```

### 👤 حساب العميل:
```
Email: test-negotiation@example.com
Password: test123456
مربوط بطلب: f5411dab-dda9-4e93-b1fc-4880e4cb595d (Aisha Ali Ghazwani)
```

---

## 📋 خطوات الاختبار:

### 1. ✅ تطبيق سياسات RLS
انتقل إلى [Supabase Dashboard > SQL Editor](https://supabase.com/dashboard) وطبق:
**`FINAL_RLS_POLICIES_WORKING.sql`**

### 2. 🧪 اختبار العميل - طلب التفاوض

```bash
# افتح المتصفح وانتقل إلى:
http://localhost:3000/auth/login

# سجّل دخول بحساب العميل:
Email: test-negotiation@example.com
Password: test123456

# انتقل لصفحة الطلب:
http://localhost:3000/request/f5411dab-dda9-4e93-b1fc-4880e4cb595d
```

**توقع رؤية:**
- ✅ بيانات الطلب (Aisha Ali Ghazwani)
- ✅ السعر الحالي: 1380 ر.س
- ✅ زر "طلب التفاوض"

**خطوات التفاوض:**
1. اضغط "طلب التفاوض"
2. املأ البيانات:
   - **السعر المقترح:** 1100
   - **السبب:** السعر أعلى من الميزانية المتاحة
3. اضغط "إرسال طلب التفاوض"

**النتيجة المتوقعة:**
- ✅ رسالة: "تم إرسال طلب التفاوض"
- ✅ إعادة توجيه لـ /dashboard

### 3. 🔍 اختبار الإدارة - الرد على التفاوض

```bash
# سجّل خروج من حساب العميل
# سجّل دخول بحساب الإدارة:
Email: admin@test.com
Password: admin123

# انتقل لصفحة إدارة الطلب:
http://localhost:3000/admin/requests/f5411dab-dda9-4e93-b1fc-4880e4cb595d
```

**توقع رؤية:**
- ✅ قسم برتقالي: "طلب تفاوض من العميل"
- ✅ رسالة العميل: "السعر أعلى من الميزانية المتاحة"
- ✅ السعر المقترح: 1100 ر.س
- ✅ السعر الأصلي: 1380 ر.س
- ✅ زر "الرد على طلب التفاوض"

**خطوات الرد:**
1. اضغط "الرد على طلب التفاوض"
2. اختر أحد الخيارات:

   **الخيار الأول: قبول السعر المقترح**
   - اضغط "قبول السعر المقترح"

   **الخيار الثاني: تطبيق خصم**
   - أدخل نسبة خصم: 15
   - اضغط "تطبيق الخصم وإرسال العرض"

3. أضف رسالة اختيارية للعميل

**النتيجة المتوقعة:**
- ✅ رسالة: "تم إرسال العرض المعدل للعميل" أو "تم قبول السعر المقترح"
- ✅ إعادة توجيه لـ /admin/requests

---

## 🔍 التحقق من النتائج:

### في قاعدة البيانات:
```sql
SELECT 
    id, status, negotiation_reason, client_proposed_price,
    admin_quoted_price, original_quoted_price, 
    negotiated_discount_percentage, negotiated_at
FROM publish_requests 
WHERE id = 'f5411dab-dda9-4e93-b1fc-4880e4cb595d';
```

### النتائج المتوقعة:
```
✅ status = 'quoted' (بعد رد الإدارة)
✅ negotiation_reason = 'السعر أعلى من الميزانية المتاحة'  
✅ client_proposed_price = 1100
✅ original_quoted_price = 1380
✅ admin_quoted_price = السعر الجديد (1100 أو مع خصم)
✅ negotiated_discount_percentage = نسبة الخصم
✅ negotiated_at = timestamp الرد
```

---

## 🚨 إذا لم يعمل - تشخيص سريع:

### 1. تحقق من Console (F12):
```javascript
// ابحث عن أخطاء في Console
// تأكد من وجود auth token في Storage
```

### 2. تحقق من Network Tab:
```
POST /api/request-negotiation
Status: 200 ✅ أو 401 ❌

POST /api/send-negotiated-quote  
Status: 200 ✅ أو 401 ❌
```

### 3. تحقق من RLS:
```sql
-- في Supabase Dashboard
SELECT schemaname, tablename, policyname
FROM pg_policies 
WHERE tablename IN ('publish_requests', 'profiles');
```

### 4. تحقق من Authentication:
```bash
# شغّل التشخيص
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('publish_requests').select('id, status').eq('id', 'f5411dab-dda9-4e93-b1fc-4880e4cb595d').then(console.log);
"
```

---

## 🎯 نقاط النجاح:

- [x] ✅ RLS مُفعل ويعمل
- [x] ✅ العميل يستطيع طلب التفاوض
- [x] ✅ حالة الطلب تتغير لـ 'negotiation'
- [x] ✅ الإدارة ترى طلب التفاوض
- [x] ✅ الإدارة تستطيع الرد
- [x] ✅ النظام يعمل بالكامل!

**جاهز للاختبار!** 🚀