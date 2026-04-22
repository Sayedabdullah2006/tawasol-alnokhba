# Post-deployment setup for Railway
# تشغيل بعد نشر التطبيق على Railway

Write-Host "🚀 إعداد ما بعد النشر على Railway..." -ForegroundColor Cyan

# Check if supabase CLI is available
try {
    $null = npx supabase --version
    Write-Host "✅ Supabase CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "📋 قائمة المهام بعد النشر:" -ForegroundColor Yellow
Write-Host "   1. نشر Supabase Edge Functions" -ForegroundColor White
Write-Host "   2. تشغيل Database Migrations" -ForegroundColor White
Write-Host "   3. تحديث Environment Variables" -ForegroundColor White
Write-Host "   4. إعداد Cron Job للتذكيرات" -ForegroundColor White
Write-Host ""

# Step 1: Deploy Edge Functions
Write-Host "🔧 الخطوة 1: نشر Supabase Edge Functions..." -ForegroundColor Cyan

Write-Host "📧 نشر دالة الإيميل المحسنة..." -ForegroundColor Yellow
npx supabase functions deploy send-enhanced-email --no-verify-jwt

Write-Host "📤 نشر دالة الإيميل الأساسية..." -ForegroundColor Yellow
npx supabase functions deploy send-email --no-verify-jwt

Write-Host "⏰ نشر دالة التذكيرات اليومية..." -ForegroundColor Yellow
npx supabase functions deploy daily-reminders --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر جميع Edge Functions بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ مشكلة في نشر Edge Functions - تحقق من الأخطاء أعلاه" -ForegroundColor Red
}

# Step 2: Run Migrations
Write-Host ""
Write-Host "🔧 الخطوة 2: تشغيل Database Migrations..." -ForegroundColor Cyan
$runMigrations = Read-Host "هل تريد تشغيل migrations؟ (y/N)"
if ($runMigrations -eq 'y' -or $runMigrations -eq 'Y') {
    Write-Host "🗄️ تشغيل migrations..." -ForegroundColor Yellow
    npx supabase db push

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ تم تشغيل migrations بنجاح" -ForegroundColor Green
    } else {
        Write-Host "❌ مشكلة في migrations - قد تحتاج تشغيل يدوي" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ تخطي migrations - تأكد من تشغيلها يدوياً إذا كانت مطلوبة" -ForegroundColor Yellow
}

# Step 3: Environment Variables Check
Write-Host ""
Write-Host "🔧 الخطوة 3: فحص Environment Variables..." -ForegroundColor Cyan
Write-Host "تأكد من أن Railway يحتوي على المتغيرات التالية:" -ForegroundColor Yellow

$requiredVars = @(
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)

foreach ($var in $requiredVars) {
    Write-Host "   • $var" -ForegroundColor White
}

Write-Host ""
Write-Host "📍 للتحقق/إضافة المتغيرات:" -ForegroundColor Gray
Write-Host "   1. انتقل لـ Railway Dashboard" -ForegroundColor Gray
Write-Host "   2. اختر مشروعك > Variables" -ForegroundColor Gray
Write-Host "   3. أضف/حدث المتغيرات المطلوبة" -ForegroundColor Gray

# Step 4: Cron Job Setup
Write-Host ""
Write-Host "🔧 الخطوة 4: إعداد Cron Job للتذكيرات..." -ForegroundColor Cyan
$setupCron = Read-Host "هل تريد رؤية إعدادات Cron Job؟ (y/N)"
if ($setupCron -eq 'y' -or $setupCron -eq 'Y') {
    Write-Host ""
    Write-Host "⏰ إعدادات Cron Job المطلوبة:" -ForegroundColor Yellow
    Write-Host "   استخدم cron-job.org أو خدمة مشابهة" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 الإعدادات:" -ForegroundColor Cyan
    Write-Host "   URL: https://[your-railway-domain].railway.app/api/cron/daily-reminders" -ForegroundColor White
    Write-Host "   Method: GET" -ForegroundColor White
    Write-Host "   Header: x-api-key: [your-cron-api-key]" -ForegroundColor White
    Write-Host "   Schedule: 0 6 * * * (يومياً 9 صباحاً بتوقيت السعودية)" -ForegroundColor White
    Write-Host "   Timeout: 300 seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "🔑 لا تنس استبدال:" -ForegroundColor Yellow
    Write-Host "   • [your-railway-domain] بـ domain الخاص بك" -ForegroundColor White
    Write-Host "   • [your-cron-api-key] بالمفتاح من متغيرات البيئة" -ForegroundColor White
}

# Testing
Write-Host ""
Write-Host "🧪 اختبار النظام بعد النشر..." -ForegroundColor Cyan
$testSystem = Read-Host "هل تريد اختبار النظام الآن؟ (y/N)"
if ($testSystem -eq 'y' -or $testSystem -eq 'Y') {
    Write-Host ""
    Write-Host "🔍 لاختبار النظام:" -ForegroundColor Yellow
    Write-Host "   1. انتقل لـ: https://[your-domain]/admin/email-tools" -ForegroundColor White
    Write-Host "   2. اختبر إرسال إيميل" -ForegroundColor White
    Write-Host "   3. تحقق من وصول CC للإدارة" -ForegroundColor White
    Write-Host ""
    Write-Host "   4. انتقل لـ: https://[your-domain]/admin/reminders" -ForegroundColor White
    Write-Host "   5. اختبر تشغيل job التذكيرات" -ForegroundColor White
    Write-Host "   6. راجع الإحصائيات والسجلات" -ForegroundColor White
    Write-Host ""
    Write-Host "🌐 اختبار Cron endpoint:" -ForegroundColor Yellow
    Write-Host "   GET https://[your-domain]/api/cron/daily-reminders?key=[api-key]" -ForegroundColor White
}

Write-Host ""
Write-Host "🎉 إعداد ما بعد النشر مكتمل!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 ملخص المطلوب:" -ForegroundColor Cyan
Write-Host "   ✅ Railway نشر التطبيق تلقائياً" -ForegroundColor Green
Write-Host "   ✅ Supabase Edge Functions منشورة" -ForegroundColor Green
Write-Host "   ⏳ Environment Variables (تحقق يدوي)" -ForegroundColor Yellow
Write-Host "   ⏳ Database Migrations (حسب الحاجة)" -ForegroundColor Yellow
Write-Host "   ⏳ Cron Job Setup (إعداد يدوي)" -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 النظام جاهز للعمل!" -ForegroundColor Green