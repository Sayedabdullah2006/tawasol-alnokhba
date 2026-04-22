# 🚂 دليل النشر على Railway

## 📍 أين تجد متغيرات البيئة في Railway؟

1. **اذهب إلى لوحة تحكم Railway:** https://railway.app
2. **اختر مشروعك** (influencers)
3. **اضغط على "Variables"** في القائمة الجانبية
4. **أضف المتغيرات التالية:**

## 🔑 المتغيرات المطلوبة:

### قاعدة البيانات:
- `NEXT_PUBLIC_SUPABASE_URL` → من لوحة تحكم Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → من لوحة تحكم Supabase  
- `SUPABASE_SERVICE_ROLE_KEY` → من لوحة تحكم Supabase

### Moyasar للدفع:
- `NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY` → من لوحة تحكم Moyasar (المفتاح الحقيقي!)
- `MOYASAR_SECRET_KEY` → من لوحة تحكم Moyasar (المفتاح السري!)

### الحماية:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` → من Cloudflare
- `TURNSTILE_SECRET_KEY` → من Cloudflare

### الإيميلات:
- `RESEND_API_KEY` → من https://resend.com
- `ADMIN_EMAIL` → admin@ksa-influencers.com

### الموقع:
- `NEXT_PUBLIC_SITE_URL` → رابط موقعك في Railway
- `NODE_ENV` → production

### معلومات المنصة:
- `PLATFORM_NAME_AR` → مؤثرون
- `PLATFORM_NAME_EN` → KSA-Influencers
- `PLATFORM_TAGLINE` → اترك أثراً دائماً..

### معلومات البنك:
- `BANK_IBAN` → رقم الآيبان
- `BANK_NAME` → اسم البنك
- `ACCOUNT_NAME` → اسم الحساب

---

## ⚠️ ملاحظة مهمة:
**لا تضع المفاتيح الحقيقية في GitHub!** ضعها في Railway فقط.

## 📧 للحصول على المفاتيح:
- **Moyasar**: https://dashboard.moyasar.com → API Keys
- **Supabase**: https://supabase.com/dashboard → Settings → API
- **Resend**: https://resend.com → API Keys
- **Cloudflare**: https://dash.cloudflare.com → Turnstile