# Deploy email reminders system to Supabase
# نشر نظام التذكيرات اليومية إلى Supabase

Write-Host "📧 نشر نظام التذكيرات اليومية..." -ForegroundColor Cyan

# Check if supabase CLI is available
try {
    $null = npx supabase --version
    Write-Host "✅ Supabase CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Deploy the migrations first
Write-Host "🗄️ نشر migrations قاعدة البيانات..." -ForegroundColor Yellow
$migrationResult = npx supabase db push

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر migrations بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل في نشر migrations" -ForegroundColor Red
    Write-Host "💡 يمكنك المحاولة يدوياً بالأمر: npx supabase db push" -ForegroundColor Yellow
}

# Deploy the daily reminders function
Write-Host "⏰ نشر دالة التذكيرات اليومية..." -ForegroundColor Yellow
$functionResult = npx supabase functions deploy daily-reminders --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر دالة التذكيرات بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل في نشر دالة التذكيرات" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 تم نشر نظام التذكيرات بنجاح!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 ما تم نشره:" -ForegroundColor Cyan
Write-Host "   • جدول email_reminder_logs لتتبع التذكيرات" -ForegroundColor White
Write-Host "   • دالة daily-reminders للتشغيل التلقائي" -ForegroundColor White
Write-Host "   • API endpoints للإدارة والاختبار" -ForegroundColor White
Write-Host "   • صفحة إدارية في /admin/reminders" -ForegroundColor White
Write-Host ""
Write-Host "🔧 للاختبار:" -ForegroundColor Cyan
Write-Host "   1. انتقل إلى /admin/reminders" -ForegroundColor White
Write-Host "   2. اختبر إرسال تذكير واحد" -ForegroundColor White
Write-Host "   3. شغّل job التذكيرات يدوياً" -ForegroundColor White
Write-Host "   4. راجع الإحصائيات والسجلات" -ForegroundColor White
Write-Host ""
Write-Host "⏰ للجدولة التلقائية:" -ForegroundColor Cyan
Write-Host "   استخدم خدمة cron خارجية مثل cron-job.org" -ForegroundColor White
Write-Host "   URL للاستدعاء: https://[supabase-url]/functions/v1/daily-reminders" -ForegroundColor Yellow
Write-Host "   الوقت المقترح: يومياً في الساعة 9:00 صباحاً" -ForegroundColor White
Write-Host ""
Write-Host "📧 أنواع التذكيرات:" -ForegroundColor Cyan
Write-Host "   • موافقة على العرض (quoted) - بعد يومين، كل 3 أيام" -ForegroundColor White
Write-Host "   • إتمام الدفع (approved) - بعد يوم، كل يومين" -ForegroundColor White
Write-Host "   • مراجعة المحتوى (content_review) - بعد 3 أيام، كل 4 أيام" -ForegroundColor White
Write-Host ""
Write-Host "✅ النشر مكتمل. نظام التذكيرات جاهز للعمل!" -ForegroundColor Green

# Optional: Test the system
Write-Host ""
$test = Read-Host "هل تريد اختبار النظام الآن؟ (y/N)"
if ($test -eq 'y' -or $test -eq 'Y') {
    Write-Host "🧪 اختبار نظام التذكيرات..." -ForegroundColor Yellow
    Write-Host "افتح المتصفح وانتقل إلى: /admin/reminders" -ForegroundColor Gray
    Write-Host "أو استخدم API endpoint: /api/admin/run-reminders" -ForegroundColor Gray
}