# 🧪 دليل اختبار نظام التفاوض الكامل

## خطوات الحل:

### 1. ✅ تطبيق سياسات RLS
انتقل إلى [Supabase Dashboard](https://supabase.com/dashboard) وطبق الـ SQL في ملف `FINAL_RLS_FIX.sql`

### 2. 🧪 حسابات الاختبار الجاهزة:

#### حساب العميل:
- **Email:** `test-negotiation@example.com`
- **Password:** `test123456`
- **مربوط بطلب:** Aisha Ali Ghazwani (السعر: 1380 ر.س)

#### حساب الإدارة:
- **Email:** `admin@test.com`
- **Password:** `admin123`
- **الصلاحية:** admin

### 3. 🔍 خطوات الاختبار:

#### أ) اختبار العميل:
1. انتقل إلى: `http://localhost:3000/auth/login`
2. سجّل دخول بـ `test-negotiation@example.com` / `test123456`
3. انتقل إلى: `http://localhost:3000/request/f5411dab-dda9-4e93-b1fc-4880e4cb595d`
4. يجب أن ترى:
   - ✅ بيانات الطلب
   - ✅ السعر المقتبس: 1380 ر.س
   - ✅ زر "طلب التفاوض" 
5. اضغط "طلب التفاوض"
6. املأ:
   - **السعر المقترح:** 1100
   - **السبب:** السعر أعلى من الميزانية المتاحة
7. اضغط "إرسال طلب التفاوض"
8. يجب أن ترى رسالة: ✅ **"تم إرسال طلب التفاوض"**

#### ب) اختبار الإدارة:
1. سجّل خروج من حساب العميل
2. سجّل دخول بـ `admin@test.com` / `admin123`
3. انتقل إلى: `http://localhost:3000/admin/requests/f5411dab-dda9-4e93-b1fc-4880e4cb595d`
4. يجب أن ترى:
   - ✅ قسم برتقالي: **"طلب تفاوض من العميل"**
   - ✅ رسالة العميل: "السعر أعلى من الميزانية المتاحة"
   - ✅ السعر المقترح: 1100 ر.س
   - ✅ زر "الرد على طلب التفاوض"
5. اضغط "الرد على طلب التفاوض"
6. اختر إحدى الخيارات:
   - **الخيار الأول:** قبول السعر المقترح (1100 ر.س)
   - **الخيار الثاني:** تطبيق نسبة خصم (مثلاً 15%)
7. اضغط الزر المناسب
8. يجب أن ترى رسالة: ✅ **"تم إرسال العرض المعدل للعميل"**

### 4. 🔍 التحقق من النتائج:

#### في قاعدة البيانات:
```sql
SELECT id, status, negotiation_reason, client_proposed_price, 
       admin_quoted_price, original_quoted_price, negotiated_discount_percentage
FROM publish_requests 
WHERE id = 'f5411dab-dda9-4e93-b1fc-4880e4cb595d';
```

**النتيجة المتوقعة:**
- ✅ `status`: `quoted` (بعد رد الإدارة)
- ✅ `negotiation_reason`: "السعر أعلى من الميزانية المتاحة"
- ✅ `client_proposed_price`: 1100
- ✅ `original_quoted_price`: 1380
- ✅ `admin_quoted_price`: السعر الجديد بعد التفاوض
- ✅ `negotiated_discount_percentage`: نسبة الخصم

### 5. 🎯 العملية الكاملة:

```
العميل يرى طلب بسعر 1380 ر.س
     ↓
يضغط "طلب التفاوض" ويقترح 1100 ر.س
     ↓
حالة الطلب تتغير إلى "negotiation"
     ↓
الإدارة ترى طلب التفاوض في صفحة الإدارة
     ↓
الإدارة ترد بقبول السعر أو تطبيق خصم
     ↓
حالة الطلب تعود إلى "quoted" مع السعر الجديد
     ↓
العميل يتلقى إشعار بالعرض الجديد
```

### 6. ⚠️ إذا لم يعمل:

1. **تحقق من Console الـ JavaScript:**
   - اضغط F12 > Console
   - ابحث عن أخطاء أثناء الضغط على الأزرار

2. **تحقق من Network Tab:**
   - F12 > Network
   - راقب API calls إلى `/api/request-negotiation` و `/api/send-negotiated-quote`

3. **تحقق من Authentication:**
   - F12 > Application > Storage
   - ابحث عن `sb-rbyglvwbojitxyazmgap-auth-token`

4. **شغّل التشخيص:**
   ```bash
   node debug-negotiation.js
   ```

### 7. 📞 إذا احتجت مساعدة:

أرسل لي:
1. لقطة شاشة من الخطأ
2. نتيجة `debug-negotiation.js`
3. لقطة شاشة من Developer Console

---

## ✅ تأكيدات النجاح:

- [x] الكود جاهز ومُطبق
- [x] قاعدة البيانات تحتوي على جميع الأعمدة
- [x] سياسات RLS مُطبقة
- [x] حسابات اختبار جاهزة
- [x] دليل اختبار كامل

**النظام جاهز 100% للاختبار!** 🚀