# إعداد بيئة الاختبار لـ Moyasar

## 1. احصل على مفاتيح الاختبار من Moyasar

اذهب إلى: https://moyasar.com/dashboard
- سجل دخول أو أنشئ حساب
- من الـ Dashboard، انسخ:
  - **Test Publishable Key**: `pk_test_...`
  - **Test Secret Key**: `sk_test_...`

## 2. أضف المفاتيح في .env.local

```bash
# إضافة في ملف .env.local
NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY=pk_test_YOUR_ACTUAL_KEY
MOYASAR_SECRET_KEY_Test=sk_test_YOUR_ACTUAL_SECRET_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 3. اختبار الاتصال بـ API

```bash
node test-moyasar.js
```

**النتيجة المتوقعة:**
```
🧪 Testing Moyasar API connectivity...
🔑 Using key: sk_test_...
📊 Response Status: 200
✅ Success! Moyasar API is accessible
📝 Found 0 payments in account
```

## 4. اختبار الواجهة

```bash
npm run dev
# اذهب إلى: http://localhost:3000/payment/[request-id]
# اختر "دفع إلكتروني"
```

## 5. بطاقات اختبار Moyasar

استخدم هذه البطاقات للاختبار:

### ✅ بطاقة نجحة:
- **رقم البطاقة**: 4111 1111 1111 1111
- **تاريخ الانتهاء**: أي تاريخ مستقبلي
- **CVV**: 123

### ❌ بطاقة فاشلة:
- **رقم البطاقة**: 4000 0000 0000 0002
- **تاريخ الانتهاء**: أي تاريخ مستقبلي  
- **CVV**: 123

## 6. مراقبة اللوجز

```bash
# في Terminal أثناء التطوير
npm run dev

# ستظهر رسائل مثل:
[MOYASAR_WEBHOOK] Received paid for payment pay_...
[PAYMENT_SUCCESS] Payment completed successfully
```

## 7. فحص Callback Pages

اختبر الصفحات:
- `/payment/callback?id=pay_test123&status=paid` ← نجح
- `/payment/callback?id=pay_test123&status=failed` ← فشل
- `/payment/callback?id=pay_test123&status=initiated` ← قيد المعالجة