#!/bin/bash

# Deploy enhanced email functions to Supabase
# Run this script to update the email system with deliverability improvements

echo "🚀 Deploying enhanced email system..."

# Check if supabase CLI is available
if ! command -v npx supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Deploy the enhanced email function
echo "📧 Deploying enhanced email function..."
npx supabase functions deploy send-enhanced-email --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ Enhanced email function deployed successfully"
else
    echo "❌ Failed to deploy enhanced email function"
    exit 1
fi

# Keep the original email function as backup
echo "📧 Deploying backup email function..."
npx supabase functions deploy send-email --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ Backup email function deployed successfully"
else
    echo "⚠️ Warning: Failed to deploy backup email function"
fi

echo ""
echo "🎉 Email system deployment completed!"
echo ""
echo "📋 What was deployed:"
echo "   • Enhanced email function with deliverability improvements"
echo "   • Comprehensive anti-spam headers"
echo "   • Automatic text version generation"
echo "   • Content validation against spam triggers"
echo "   • Better error handling and retry logic"
echo ""
echo "🔧 To test the system:"
echo "   1. Navigate to /admin/email-tools"
echo "   2. Run email tests to verify functionality"
echo "   3. Check email logs for any issues"
echo ""
echo "📈 Expected improvements:"
echo "   • Higher inbox delivery rate"
echo "   • Lower spam classification"
echo "   • Better email client compatibility"
echo "   • Improved sender reputation"
echo ""
echo "✅ Deployment complete. Enhanced email system is now active!"