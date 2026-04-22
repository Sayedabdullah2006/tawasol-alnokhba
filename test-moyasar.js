/**
 * Test Moyasar API connectivity
 * Run with: node test-moyasar.js
 */

const https = require('https');

// Get secret key from environment
const secretKey = process.env.NODE_ENV === 'production'
  ? process.env.MOYASAR_SECRET_KEY
  : process.env.MOYASAR_SECRET_KEY_Test;

if (!secretKey) {
  console.error('❌ Error: MOYASAR_SECRET_KEY_Test not found in environment');
  console.log('Please add MOYASAR_SECRET_KEY_Test=sk_test_... to your .env.local file');
  process.exit(1);
}

// Build auth header
const credentials = Buffer.from(`${secretKey}:`).toString('base64');
const authHeader = `Basic ${credentials}`;

console.log('🧪 Testing Moyasar API connectivity...');
console.log(`🔑 Using key: ${secretKey.substring(0, 10)}...`);

// Test API call
const options = {
  hostname: 'api.moyasar.com',
  port: 443,
  path: '/v1/payments',
  method: 'GET',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`\n📊 Response Status: ${res.statusCode}`);
    console.log(`📋 Response Headers:`, res.headers);

    if (res.statusCode === 200) {
      console.log('✅ Success! Moyasar API is accessible');
      try {
        const payments = JSON.parse(data);
        console.log(`📝 Found ${payments.length || 0} payments in account`);
      } catch (e) {
        console.log('📄 Response data:', data.substring(0, 200));
      }
    } else {
      console.log('❌ API call failed');
      console.log('📄 Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.end();