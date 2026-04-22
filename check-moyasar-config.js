/**
 * Moyasar Configuration Checker
 * يساعد في التحقق من صحة إعدادات Moyasar في Railway
 */

console.log('🔍 فحص إعدادات Moyasar...\n');

// 1. التحقق من المتغيرات المطلوبة
const requiredVars = [
  'NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY',
  'MOYASAR_SECRET_KEY',
  'MOYASAR_SECRET_KEY_Test',
  'NEXT_PUBLIC_SITE_URL'
];

console.log('📋 المتغيرات المطلوبة:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  const display = value ?
    (value.length > 20 ? value.substring(0, 20) + '...' : value) :
    'غير موجود';

  console.log(`${status} ${varName}: ${display}`);
});

console.log('\n🌍 البيئة الحالية:', process.env.NODE_ENV || 'development');

// 2. التحقق من صحة المفاتيح
const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY;
const secretKey = process.env.MOYASAR_SECRET_KEY;
const testSecretKey = process.env.MOYASAR_SECRET_KEY_Test;

console.log('\n🔑 تحقق من صحة المفاتيح:');

if (publishableKey) {
  if (publishableKey.startsWith('pk_live_')) {
    console.log('✅ Publishable Key: مفتاح إنتاج صحيح');
  } else if (publishableKey.startsWith('pk_test_')) {
    console.log('⚠️ Publishable Key: مفتاح اختبار (تأكد من أنه مطلوب)');
  } else {
    console.log('❌ Publishable Key: تنسيق غير صحيح');
  }
}

if (secretKey) {
  if (secretKey.startsWith('sk_live_')) {
    console.log('✅ Secret Key: مفتاح إنتاج صحيح');
  } else {
    console.log('❌ Secret Key: يجب أن يبدأ بـ sk_live_');
  }
}

if (testSecretKey) {
  if (testSecretKey.startsWith('sk_test_')) {
    console.log('✅ Test Secret Key: مفتاح اختبار صحيح');
  } else {
    console.log('❌ Test Secret Key: يجب أن يبدأ بـ sk_test_');
  }
}

// 3. التحقق من URL الموقع
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (siteUrl) {
  if (siteUrl.startsWith('https://')) {
    console.log('✅ Site URL: صحيح ويستخدم HTTPS');
  } else {
    console.log('⚠️ Site URL: يُفضل استخدام HTTPS');
  }
} else {
  console.log('❌ Site URL: مطلوب لـ callback URLs');
}

console.log('\n🔗 Callback URLs:');
console.log(`Payment Callback: ${siteUrl}/payment/callback`);
console.log(`Webhook URL: ${siteUrl}/api/webhooks/moyasar`);

console.log('\n📝 لإضافة المتغيرات في Railway:');
console.log('1. افتح لوحة تحكم Railway');
console.log('2. اذهب إلى Variables');
console.log('3. أضف كل متغير بقيمته الصحيحة');
console.log('4. أعد تشغيل التطبيق');

console.log('\n🛠️ استكشاف أخطاء الدفع:');
console.log('- تأكد من أن البطاقة صالحة');
console.log('- تحقق من أن البنك لا يحجب المعاملات الدولية');
console.log('- راجع لوحة تحكم Moyasar للمزيد من التفاصيل');