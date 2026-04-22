#!/bin/bash
# 🚀 نشر سريع لبيئة الإنتاج

echo "🔧 جاري تحضير النشر للإنتاج..."

# 1. فحص التغييرات غير المحفوظة
if [[ `git status --porcelain` ]]; then
  echo "❌ يوجد تغييرات غير محفوظة. يرجى حفظها أولاً:"
  git status --short
  exit 1
fi

# 2. فحص مفاتيح الإنتاج
if ! grep -q "pk_live_" .env.production; then
  echo "⚠️ تحذير: لم يتم تحديث مفاتيح Moyasar الحقيقية بعد!"
  echo "يرجى تحديث .env.production بالمفاتيح الصحيحة"
  exit 1
fi

# 3. بناء المشروع
echo "📦 جاري بناء المشروع..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ فشل بناء المشروع!"
  exit 1
fi

# 4. رفع للمستودع
echo "📤 جاري رفع الكود..."
git add .
git commit -m "🚀 Production deployment: $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main

echo "✅ تم النشر بنجاح!"
echo "🔗 تفقد لوحة التحكم في Vercel لمتابعة النشر"
echo "📋 استخدم PRODUCTION_CHECKLIST.md للفحص النهائي"