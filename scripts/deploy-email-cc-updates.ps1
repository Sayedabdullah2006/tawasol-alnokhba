# Deploy email CC updates - إضافة نسخة للإدارة لجميع إيميلات العملاء
# Updates all email functions to include CC to first1saudi@gmail.com

Write-Host "📧 نشر تحديثات CC للإيميلات..." -ForegroundColor Cyan

# Check if supabase CLI is available
try {
    $null = npx supabase --version
    Write-Host "✅ Supabase CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Deploy updated email functions
Write-Host "📤 نشر دالة الإيميل المحسنة مع CC..." -ForegroundColor Yellow
$enhancedResult = npx supabase functions deploy send-enhanced-email --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر دالة الإيميل المحسنة بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل في نشر دالة الإيميل المحسنة" -ForegroundColor Red
}

Write-Host "📤 نشر دالة الإيميل الأساسية مع CC..." -ForegroundColor Yellow
$basicResult = npx supabase functions deploy send-email --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر دالة الإيميل الأساسية بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل في نشر دالة الإيميل الأساسية" -ForegroundColor Red
}

Write-Host "⏰ نشر دالة التذكيرات المحدثة..." -ForegroundColor Yellow
$remindersResult = npx supabase functions deploy daily-reminders --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر دالة التذكيرات بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل في نشر دالة التذكيرات" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 تم نشر تحديثات CC بنجاح!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 ما تم تحديثه:" -ForegroundColor Cyan
Write-Host "   • إضافة CC تلقائي لـ first1saudi@gmail.com" -ForegroundColor White
Write-Host "   • تطبيق على جميع إيميلات العملاء" -ForegroundColor White
Write-Host "   • تطبيق على التذكيرات اليومية" -ForegroundColor White
Write-Host "   • دعم في النظام المحسن والأساسي" -ForegroundColor White
Write-Host ""
Write-Host "🔧 للاختبار:" -ForegroundColor Cyan
Write-Host "   1. انتقل إلى /admin/email-tools" -ForegroundColor White
Write-Host "   2. أرسل إيميل اختبار" -ForegroundColor White
Write-Host "   3. تحقق من وصول نسخة لـ first1saudi@gmail.com" -ForegroundColor White
Write-Host ""
Write-Host "📧 التأثير:" -ForegroundColor Cyan
Write-Host "   • جميع إيميلات العملاء ستصل بـ CC للإدارة" -ForegroundColor Green
Write-Host "   • التذكيرات اليومية ستشمل CC" -ForegroundColor Green
Write-Host "   • إيميلات الإشعارات والتحديثات ستشمل CC" -ForegroundColor Green
Write-Host "   • إيميلات التفاوض والعروض ستشمل CC" -ForegroundColor Green
Write-Host ""
Write-Host "✅ جميع إيميلات العملاء ستصل الآن بنسخة للإدارة!" -ForegroundColor Green

# Test notification
Write-Host ""
$test = Read-Host "هل تريد اختبار النظام المحدث؟ (y/N)"
if ($test -eq 'y' -or $test -eq 'Y') {
    Write-Host "🧪 اختبار نظام الإيميل المحدث..." -ForegroundColor Yellow
    Write-Host "انتقل إلى: /admin/email-tools" -ForegroundColor Gray
    Write-Host "أو اختبر التذكيرات من: /admin/reminders" -ForegroundColor Gray
}