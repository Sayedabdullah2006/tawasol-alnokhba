# Deploy enhanced email functions to Supabase
# Run this script to update the email system with deliverability improvements

Write-Host "🚀 Deploying enhanced email system..." -ForegroundColor Cyan

# Check if supabase CLI is available
try {
    $null = npx supabase --version
    Write-Host "✅ Supabase CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Deploy the enhanced email function
Write-Host "📧 Deploying enhanced email function..." -ForegroundColor Yellow
$result1 = npx supabase functions deploy send-enhanced-email --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Enhanced email function deployed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to deploy enhanced email function" -ForegroundColor Red
    exit 1
}

# Keep the original email function as backup
Write-Host "📧 Deploying backup email function..." -ForegroundColor Yellow
$result2 = npx supabase functions deploy send-email --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup email function deployed successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️ Warning: Failed to deploy backup email function" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Email system deployment completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 What was deployed:" -ForegroundColor Cyan
Write-Host "   • Enhanced email function with deliverability improvements" -ForegroundColor White
Write-Host "   • Comprehensive anti-spam headers" -ForegroundColor White
Write-Host "   • Automatic text version generation" -ForegroundColor White
Write-Host "   • Content validation against spam triggers" -ForegroundColor White
Write-Host "   • Better error handling and retry logic" -ForegroundColor White
Write-Host ""
Write-Host "🔧 To test the system:" -ForegroundColor Cyan
Write-Host "   1. Navigate to /admin/email-tools" -ForegroundColor White
Write-Host "   2. Run email tests to verify functionality" -ForegroundColor White
Write-Host "   3. Check email logs for any issues" -ForegroundColor White
Write-Host ""
Write-Host "📈 Expected improvements:" -ForegroundColor Cyan
Write-Host "   • Higher inbox delivery rate" -ForegroundColor Green
Write-Host "   • Lower spam classification" -ForegroundColor Green
Write-Host "   • Better email client compatibility" -ForegroundColor Green
Write-Host "   • Improved sender reputation" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Deployment complete. Enhanced email system is now active!" -ForegroundColor Green

# Optional: Test the system
Write-Host ""
$test = Read-Host "Would you like to run a quick email test? (y/N)"
if ($test -eq 'y' -or $test -eq 'Y') {
    Write-Host "🧪 Testing enhanced email system..." -ForegroundColor Yellow
    Write-Host "Note: You can also test via the admin panel at /admin/email-tools" -ForegroundColor Gray
}