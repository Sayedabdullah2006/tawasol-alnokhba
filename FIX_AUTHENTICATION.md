# حل مشكلة المصادقة في نظام التفاوض

## المشكلة المكتشفة:
❌ خطأ "غير مصرح" عند طلب التفاوض  
❌ هذا يعني أن المصادقة لا تعمل بشكل صحيح

## الأسباب المحتملة:

### 1. مشكلة في تسجيل دخول العميل
- العميل غير مسجل دخول
- انتهت صلاحية session
- مشكلة في cookies

### 2. مشكلة في إعداد Supabase Auth
- RLS policies غير صحيحة
- مشكلة في Auth configuration

### 3. مشكلة في الكود
- API لا يقرأ session بشكل صحيح
- مشكلة في middleware

## خطوات الحل:

### 1. فحص تسجيل دخول العميل

افتح المتصفح وانتقل إلى أحد الطلبات:
```
http://localhost:3000/request/f5411dab-dda9-4e93-b1fc-4880e4cb595d
```

تأكد من:
- ✅ ظهور بيانات الطلب
- ✅ ظهور زر "طلب التفاوض"
- ✅ عدم وجود رسالة "يجب تسجيل الدخول"

### 2. فحص Developer Console

1. اضغط `F12` لفتح Developer Tools
2. انتقل إلى تبويب `Application` أو `Storage`
3. تحقق من وجود:
   ```
   sb-[project-id]-auth-token
   sb-[project-id]-auth-token-code-verifier
   ```

### 3. فحص Network Tab

1. في Developer Tools، انتقل إلى `Network`
2. اضغط على "طلب التفاوض"
3. راقب الطلب إلى `/api/request-negotiation`
4. تحقق من:
   - ✅ Status Code (يجب أن يكون 200، ليس 401)
   - ✅ Request Headers تحتوي على Authorization
   - ✅ Response لا يحتوي على "غير مصرح"

### 4. اختبار تسجيل دخول جديد

إذا لم يكن العميل مسجل دخول:

1. انتقل إلى `/auth/login`
2. سجّل دخول بإيميل أحد العملاء:
   - `a1431-ag@hotmail.com`
   - `ibramed21@hotmail.com`
   - `reem37404@gmail.com`
3. بعد تسجيل الدخول، حاول مرة أخرى

### 5. فحص RLS Policies

```sql
-- تحقق من السياسات
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'publish_requests';
```

### 6. تصحيح مؤقت للاختبار

إذا استمرت المشكلة، يمكن تعطيل Auth مؤقتاً للاختبار:

في ملف `src/app/api/request-negotiation/route.ts`:

```typescript
// تعليق مؤقت لاختبار النظام
/*
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

// Verify the user owns this request
if (existingRequest.user_id !== user.id) {
  return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
}
*/
```

⚠️ **تحذير:** لا تترك هذا التعطيل في الإنتاج!

## الاختبار بعد الحل:

1. سجّل دخول كعميل
2. انتقل لطلبك في حالة `quoted`
3. اضغط "طلب التفاوض"
4. املأ البيانات واضغط إرسال
5. يجب أن ترى "تم إرسال طلب التفاوض"
6. سجّل دخول كإدارة
7. انتقل لنفس الطلب
8. يجب أن ترى قسم التفاوض باللون البرتقالي

## إذا استمرت المشكلة:

أرسل لي:
1. لقطة شاشة من Developer Console (errors)
2. لقطة شاشة من Network tab عند الضغط على زر التفاوض
3. لقطة شاشة من Application/Storage tab (cookies)

## حلول إضافية:

### تسجيل دخول قسري للاختبار:
```sql
-- إنشاء مستخدم تجريبي إذا لم يكن موجود
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  'test-user-id-123',
  'test@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;
```