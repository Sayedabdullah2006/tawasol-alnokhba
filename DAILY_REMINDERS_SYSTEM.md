# نظام التذكيرات اليومية للعملاء - Daily Email Reminders System

نظام شامل لإرسال تذكيرات مهذبة ومهنية للعملاء بالطلبات التي تحتاج إجراء منهم.

## 📋 الحالات المشمولة / Covered Statuses

### 1. العرض بانتظار الموافقة (quoted) 💰
- **المتطلب من العميل**: مراجعة العرض والموافقة عليه أو رفضه
- **بداية التذكير**: بعد يومين من إرسال العرض
- **تكرار التذكير**: كل 3 أيام
- **الحد الأقصى**: 5 تذكيرات
- **نبرة الرسائل**: متفائلة ومحفزة → تشجيعية → داعمة → أخيرة ودودة

### 2. الطلب معتمد بانتظار الدفع (approved) 💳
- **المتطلب من العميل**: إتمام عملية الدفع ورفع الإيصال
- **بداية التذكير**: بعد يوم واحد من الاعتماد
- **تكرار التذكير**: كل يومين
- **الحد الأقصى**: 7 تذكيرات
- **نبرة الرسائل**: احتفالية → تشجيعية → داعمة → عاجلة ولكن مهذبة

### 3. المحتوى بانتظار المراجعة (content_review) 👁️
- **المتطلب من العميل**: مراجعة المحتوى والموافقة أو طلب تعديلات
- **بداية التذكير**: بعد 3 أيام من إرسال المحتوى
- **تكرار التذكير**: كل 4 أيام
- **الحد الأقصى**: 4 تذكيرات
- **نبرة الرسائل**: متحمسة للمحتوى → ودودة → مرنة → أخيرة مع إنذار لطيف

## 🏗️ البنية التقنية / Technical Architecture

### الملفات الأساسية / Core Files:
```
src/lib/email-reminders.ts              # منطق التذكيرات وقوالب الرسائل
supabase/functions/daily-reminders/     # Job يومية في Supabase Edge Function
src/app/api/admin/run-reminders/        # API للإدارة والاختبار
src/app/api/cron/daily-reminders/       # API عام للجدولة التلقائية
src/app/admin/reminders/                # واجهة إدارية للتحكم
supabase/migrations/..._email_reminder_logs.sql  # جدول تتبع التذكيرات
```

### قاعدة البيانات / Database:
```sql
-- جدول تتبع التذكيرات المرسلة
CREATE TABLE email_reminder_logs (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES publish_requests(id),
  client_email VARCHAR(255) NOT NULL,
  reminder_type VARCHAR(50) NOT NULL,  -- quoted, approved, content_review
  reminder_number INTEGER NOT NULL,    -- 1, 2, 3, ...
  sent_at TIMESTAMP WITH TIME ZONE,
  email_subject TEXT
);
```

## 🚀 النشر والإعداد / Deployment and Setup

### 1. نشر النظام / Deploy System:
```powershell
# Windows PowerShell
.\scripts\deploy-reminders.ps1
```

### 2. إعداد الجدولة التلقائية / Setup Automatic Scheduling:

#### خيار 1: خدمة Cron خارجية (مُوصى به)
استخدم [cron-job.org](https://cron-job.org) أو خدمة مشابهة:

**الإعدادات**:
- **URL**: `https://nukhba.media/api/cron/daily-reminders`
- **Method**: GET أو POST
- **Headers**: `x-api-key: YOUR_API_KEY`
- **Schedule**: `0 6 * * *` (يومياً الساعة 9 ص بتوقيت السعودية)
- **Timeout**: 5 دقائق

#### خيار 2: GitHub Actions (للمطورين)
```yaml
# .github/workflows/daily-reminders.yml
name: Daily Email Reminders
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 9 AM Saudi time
jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Call Reminders API
        run: |
          curl -X GET "https://nukhba.media/api/cron/daily-reminders" \
               -H "x-api-key: ${{ secrets.CRON_API_KEY }}"
```

#### خيار 3: Supabase Cron (إذا كان متاح)
```sql
SELECT cron.schedule(
  'daily-reminders',
  '0 6 * * *',
  $$SELECT net.http_post(
    'https://nukhba.media/api/cron/daily-reminders',
    '{"source": "supabase-cron"}',
    '{"x-api-key": "YOUR_API_KEY"}'
  );$$
);
```

### 3. متغيرات البيئة / Environment Variables:
```env
# إضافة إلى .env.local
CRON_API_KEY=your-secure-api-key-here

# إضافة إلى Supabase secrets
CRON_API_KEY=your-secure-api-key-here
```

## 🧪 الاختبار / Testing

### 1. الواجهة الإدارية / Admin Interface:
انتقل إلى: `/admin/reminders`

**الميزات المتاحة**:
- ✅ تشغيل job التذكيرات يدوياً
- ✅ اختبار تذكير واحد لطلب محدد
- ✅ فحص حالة طلب وإمكانية إرسال تذكير
- ✅ إحصائيات التذكيرات المرسلة
- ✅ إعادة تعيين سجلات التذكيرات

### 2. اختبار API مباشر / Direct API Testing:
```bash
# تشغيل job يدوياً
curl -X POST "http://localhost:3000/api/admin/run-reminders" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"action": "run-daily-job"}'

# اختبار تذكير واحد
curl -X POST "http://localhost:3000/api/admin/run-reminders" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"action": "test-single-reminder", "requestId": "REQUEST_ID"}'

# اختبار cron endpoint
curl -X GET "http://localhost:3000/api/cron/daily-reminders?key=YOUR_API_KEY"
```

### 3. اختبار دالة Supabase مباشرة:
```bash
# من Supabase CLI
npx supabase functions invoke daily-reminders
```

## 📧 قوالب الرسائل / Email Templates

### خصائص التصميم / Design Features:
- **اتجاه النص**: RTL للعربية
- **الألوان**: ألوان العلامة التجارية (كحلي وذهبي)
- **التصميم**: متجاوب ومتوافق مع جميع عملاء البريد
- **المحتوى**: مهذب، ودود، ومهني

### تدرج نبرة الرسائل / Message Tone Progression:

#### للعروض (quoted):
1. **التذكير الأول**: متفائل ومتحمس 🌟
2. **الثاني**: تشجيعي مع إظهار القيمة 💫  
3. **الثالث**: داعم ومساعد 🤝
4. **الرابع والخامس**: أخيرة ودودة 🙏

#### للدفع (approved):
1. **الأول**: احتفالي بالاعتماد 🎉
2. **الثاني**: محفز للسرعة ⏰
3. **الثالث**: مساعد في حل المشاكل 💬
4. **الأخيرة**: عاجل ولكن مهذب ⚡

#### لمراجعة المحتوى (content_review):
1. **الأول**: متحمس للعرض 🎨
2. **الثاني**: تذكير ودود ⏰
3. **الثالث**: مرن ومساعد 🛠️
4. **الأخير**: تحذير لطيف مع إنذار 📋

## 📊 المراقبة والإحصائيات / Monitoring and Analytics

### المقاييس المتتبعة / Tracked Metrics:
- عدد التذكيرات المرسلة يومياً حسب النوع
- معدل الاستجابة للتذكيرات
- التوزيع الزمني للتذكيرات
- الطلبات النشطة التي تحتاج تذكير

### التقارير المتاحة / Available Reports:
- **يومي**: عدد التذكيرات المرسلة والطلبات المعالجة
- **أسبوعي**: اتجاهات الاستجابة والفعالية
- **شهري**: تحليل شامل لأداء النظام

### اللوحة الإدارية / Admin Dashboard:
```
/admin/reminders
├── تشغيل Job يدوياً
├── اختبار تذكير واحد
├── فحص حالة طلب
├── إحصائيات التذكيرات
└── إعادة تعيين السجلات
```

## 🔧 الصيانة والتطوير / Maintenance and Development

### مراجعة دورية / Regular Reviews:

#### أسبوعياً:
- [ ] مراجعة إحصائيات التذكيرات المرسلة
- [ ] تحليل معدلات الاستجابة
- [ ] فحص سجلات الأخطاء

#### شهرياً:
- [ ] تحليل فعالية نبرة الرسائل
- [ ] تقييم التوقيتات والفترات
- [ ] مراجعة الحد الأقصى للتذكيرات

#### ربع سنوي:
- [ ] تحديث قوالب الرسائل حسب التغذية الراجعة
- [ ] تحسين خوارزمية التوقيت
- [ ] إضافة أنواع تذكيرات جديدة

### إضافة نوع تذكير جديد / Adding New Reminder Type:

1. **إضافة إلى الإعدادات**:
```typescript
// src/lib/email-reminders.ts
const REMINDER_SETTINGS = {
  startAfterDays: {
    'new_status': 1,  // متى نبدأ
  },
  maxReminders: {
    'new_status': 3,  // كم مرة
  },
  intervalDays: {
    'new_status': 2,  // كل كم يوم
  }
}
```

2. **إنشاء قالب رسالة**:
```typescript
export function getNewStatusReminder(data: ReminderData, reminderNum: number) {
  // منطق إنشاء المحتوى
  return { subject, html }
}
```

3. **إضافة إلى logic الإرسال**:
```typescript
// في دالة sendReminder
case 'new_status':
  reminderContent = getNewStatusReminder(data, reminderNumber)
  break
```

### استكشاف الأخطاء / Troubleshooting:

#### التذكير لا يُرسل:
1. تحقق من حالة الطلب في قاعدة البيانات
2. تأكد من صحة بريد العميل  
3. فحص سجلات التذكيرات السابقة
4. التحقق من إعدادات التوقيت

#### فشل Job التذكيرات:
1. فحص logs في Supabase Functions
2. التأكد من صحة API keys
3. اختبار الاتصال بقاعدة البيانات
4. التحقق من خدمة البريد الإلكتروني

#### عدم وصول الرسائل:
1. فحص spam folder
2. التحقق من حالة domain reputation
3. مراجعة محتوى الرسالة ضد spam filters
4. اختبار مع email providers مختلفة

## 📈 التطويرات المستقبلية / Future Enhancements

### على المدى القريب:
- [ ] تخصيص توقيتات مختلفة حسب نوع العميل
- [ ] إضافة تذكيرات SMS للحالات العاجلة
- [ ] تحسين قوالب الرسائل باستخدام A/B testing

### على المدى المتوسط:
- [ ] نظام ذكي لتحديد أفضل وقت للإرسال
- [ ] تكامل مع WhatsApp Business API
- [ ] تحليلات متقدمة لسلوك العملاء

### على المدى البعيد:
- [ ] استخدام AI لتخصيص محتوى الرسائل
- [ ] نظام تقييم فعالية التذكيرات تلقائياً
- [ ] تكامل مع CRM خارجي

## 📞 الدعم والتواصل / Support and Contact

### للمطورين:
- **الكود**: `src/lib/email-reminders.ts`
- **الواجهة**: `/admin/reminders`
- **API**: `/api/admin/run-reminders`

### للإداريين:
- **لوحة التحكم**: `/admin/reminders`
- **الإحصائيات**: يومياً في الساعة 9 صباحاً
- **التشغيل اليدوي**: متاح في أي وقت

### في حالة المشاكل:
1. تحقق من الواجهة الإدارية أولاً
2. راجع سجلات Supabase Functions
3. اختبر API endpoints يدوياً
4. تواصل مع فريق التطوير إذا لزم الأمر

---

## ✅ قائمة التحقق للنشر / Deployment Checklist

- [ ] تشغيل migration قاعدة البيانات
- [ ] نشر دالة daily-reminders  
- [ ] إعداد متغيرات البيئة
- [ ] اختبار النظام عبر الواجهة الإدارية
- [ ] إعداد الجدولة التلقائية
- [ ] مراقبة أول تشغيل تلقائي
- [ ] توثيق الإعدادات للفريق

**تم التطوير بواسطة**: نظام تطوير تواصل النخبة  
**التاريخ**: ديسمبر 2024  
**الإصدار**: 1.0.0