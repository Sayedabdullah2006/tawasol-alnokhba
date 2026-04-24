# 🔗 اختبار Webhook ميسر

## المشكلة الحالية
```
[MOYASAR_WEBHOOK] 🚫 gzg1sq Invalid webhook authentication
```

## السبب
متغير `MOYASAR_WEBHOOK_SECRET` مفقود من ملف `.env.local`

## الحل

### 1. احصل على webhook secret من ميسر:
- سجل دخول على moyasar.com
- اذهب لـ Settings → Webhooks  
- أنشئ webhook أو عدل الموجود
- URL: `https://yourdomain.com/api/webhooks/moyasar`
- Events: `payment.paid`
- انسخ الـ webhook secret

### 2. حدث ملف .env.local:
```bash
MOYASAR_WEBHOOK_SECRET=sec_your_actual_secret_here
```

### 3. أعد تشغيل التطبيق:
```bash
npm run dev
# أو
npm start
```

## اختبار Webhook

بعد الإعداد، يجب أن ترى:
```
[MOYASAR_WEBHOOK] ✅ Webhook verified successfully
[MOYASAR_VERIFY] 🚀 Starting verification for payment ID: xxx
```

## استكشاف الأخطاء

إذا استمر الفشل:
```sql
-- فحص سجل webhook في قاعدة البيانات
SELECT * FROM webhook_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

## فحص سريع للحالة
```bash
curl -X GET http://localhost:8080/api/webhooks/moyasar
```

يجب أن يرجع:
```json
{
  "status": "ok", 
  "message": "Moyasar webhook endpoint is running"
}
```