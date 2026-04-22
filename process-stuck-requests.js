// سكريبت معالجة الطلبات العالقة والمتأخرة
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function processStuckRequests() {
  console.log('🔄 معالجة الطلبات العالقة...\n')

  try {
    // 1. فحص جميع الطلبات وحالاتها
    console.log('📊 1. تحليل حالة الطلبات الحالية:')
    const { data: allRequests, error: allError } = await supabase
      .from('publish_requests')
      .select(`
        id, status, client_name, client_email, admin_quoted_price,
        negotiation_reason, client_proposed_price, negotiation_requested_at,
        created_at, updated_at
      `)
      .order('created_at', { ascending: false })

    if (allError) {
      console.error('❌ خطأ في قراءة الطلبات:', allError.message)
      return
    }

    // تجميع الطلبات حسب الحالة
    const statusGroups = {}
    allRequests.forEach(req => {
      if (!statusGroups[req.status]) {
        statusGroups[req.status] = []
      }
      statusGroups[req.status].push(req)
    })

    console.log('\n📋 توزيع الطلبات حسب الحالة:')
    Object.entries(statusGroups).forEach(([status, requests]) => {
      console.log(`   ${status}: ${requests.length} طلب`)
    })

    // 2. معالجة الطلبات في حالة التفاوض
    console.log('\n💬 2. معالجة طلبات التفاوض العالقة:')
    const negotiationRequests = statusGroups['negotiation'] || []

    if (negotiationRequests.length === 0) {
      console.log('   ✅ لا توجد طلبات في حالة تفاوض')
    } else {
      console.log(`   وُجد ${negotiationRequests.length} طلب في حالة تفاوض:`)

      for (const req of negotiationRequests) {
        const daysSince = Math.floor((new Date() - new Date(req.negotiation_requested_at)) / (1000 * 60 * 60 * 24))

        console.log(`\n   📝 طلب: ${req.client_name}`)
        console.log(`      ID: ${req.id.substring(0, 8)}...`)
        console.log(`      السعر الأصلي: ${req.admin_quoted_price} ر.س`)
        console.log(`      السعر المقترح: ${req.client_proposed_price} ر.س`)
        console.log(`      سبب التفاوض: ${req.negotiation_reason}`)
        console.log(`      منذ: ${daysSince} أيام`)

        // اقتراح إجراءات حسب المدة
        if (daysSince > 7) {
          console.log(`      🚨 طلب قديم! يحتاج متابعة عاجلة`)
        } else if (daysSince > 3) {
          console.log(`      ⚠️ يحتاج متابعة قريباً`)
        } else {
          console.log(`      ✅ طلب حديث`)
        }
      }
    }

    // 3. معالجة الطلبات المعلقة في حالات أخرى
    console.log('\n🔍 3. فحص الطلبات المعلقة في حالات أخرى:')

    // طلبات في حالة quoted لفترة طويلة
    const quotedRequests = statusGroups['quoted'] || []
    const oldQuotedRequests = quotedRequests.filter(req => {
      const daysSince = Math.floor((new Date() - new Date(req.updated_at)) / (1000 * 60 * 60 * 24))
      return daysSince > 14 // أكثر من أسبوعين
    })

    if (oldQuotedRequests.length > 0) {
      console.log(`   📅 طلبات في حالة "quoted" لأكثر من 14 يوم: ${oldQuotedRequests.length}`)
      oldQuotedRequests.forEach(req => {
        const daysSince = Math.floor((new Date() - new Date(req.updated_at)) / (1000 * 60 * 60 * 24))
        console.log(`      - ${req.client_name}: ${daysSince} يوم`)
      })
    }

    // طلبات في حالة pending لفترة طويلة
    const pendingRequests = statusGroups['pending'] || []
    const oldPendingRequests = pendingRequests.filter(req => {
      const daysSince = Math.floor((new Date() - new Date(req.created_at)) / (1000 * 60 * 60 * 24))
      return daysSince > 7
    })

    if (oldPendingRequests.length > 0) {
      console.log(`   ⏳ طلبات في حالة "pending" لأكثر من 7 أيام: ${oldPendingRequests.length}`)
      oldPendingRequests.forEach(req => {
        const daysSince = Math.floor((new Date() - new Date(req.created_at)) / (1000 * 60 * 60 * 24))
        console.log(`      - ${req.client_name}: ${daysSince} يوم`)
      })
    }

    // 4. اقتراح إجراءات تلقائية
    console.log('\n🤖 4. إجراءات تلقائية مقترحة:')

    let actionsPerformed = 0

    // إرسال إشعارات للطلبات المتأخرة
    const alertRequests = [
      ...negotiationRequests.filter(req => {
        const daysSince = Math.floor((new Date() - new Date(req.negotiation_requested_at)) / (1000 * 60 * 60 * 24))
        return daysSince > 3
      }),
      ...oldPendingRequests
    ]

    if (alertRequests.length > 0) {
      console.log(`   📢 طلبات تحتاج تنبيه: ${alertRequests.length}`)
      console.log('      (يمكن إرسال إشعارات للإدارة)')
    }

    // تحديث timestamps للطلبات التي لم تُحدث
    const staleRequests = allRequests.filter(req => {
      const daysSince = Math.floor((new Date() - new Date(req.updated_at)) / (1000 * 60 * 60 * 24))
      return daysSince > 30 && !['completed', 'rejected', 'client_rejected'].includes(req.status)
    })

    if (staleRequests.length > 0) {
      console.log(`   🔄 طلبات قديمة جداً (>30 يوم): ${staleRequests.length}`)
      console.log('      (يمكن تحديث timestamps أو مراجعة حالاتها)')
    }

    console.log('\n🎯 5. إجراءات يدوية مطلوبة:')

    if (negotiationRequests.length > 0) {
      console.log('\n   💬 طلبات التفاوض:')
      negotiationRequests.forEach(req => {
        console.log(`   - قم بالرد على: ${req.client_name}`)
        console.log(`     الطلب: http://localhost:3000/admin/requests/${req.id}`)
      })
    }

    if (oldPendingRequests.length > 0) {
      console.log('\n   ⏳ الطلبات المعلقة:')
      oldPendingRequests.forEach(req => {
        console.log(`   - راجع طلب: ${req.client_name}`)
        console.log(`     الطلب: http://localhost:3000/admin/requests/${req.id}`)
      })
    }

    // 6. ملخص التوصيات
    console.log('\n📋 ملخص التوصيات:')
    console.log('┌─────────────────────────────────────────────┐')
    console.log('│ أولوية عالية:                             │')
    console.log(`│ - ${negotiationRequests.length} طلب تفاوض يحتاج رد            │`)
    console.log(`│ - ${oldPendingRequests.length} طلب معلق يحتاج مراجعة          │`)
    console.log('│                                             │')
    console.log('│ أولوية متوسطة:                           │')
    console.log(`│ - ${oldQuotedRequests.length} عرض سعر قديم يحتاج متابعة      │`)
    console.log('│                                             │')
    console.log('│ إجراءات مقترحة:                          │')
    console.log('│ - إرسال إشعارات للعملاء                 │')
    console.log('│ - مراجعة دورية للطلبات القديمة          │')
    console.log('│ - تحديث حالات الطلبات المتأخرة           │')
    console.log('└─────────────────────────────────────────────┘')

    console.log('\n✅ انتهى تحليل الطلبات')

  } catch (error) {
    console.error('❌ خطأ في معالجة الطلبات:', error.message)
  }
}

// دالة لتنفيذ إجراءات تلقائية (اختيارية)
async function performAutomaticActions() {
  console.log('\n🤖 تنفيذ الإجراءات التلقائية...')

  try {
    // 1. تحديث timestamps للطلبات القديمة
    const { data: updatedRequests, error: updateError } = await supabase
      .from('publish_requests')
      .update({
        updated_at: new Date().toISOString(),
        // يمكن إضافة ملاحظة إدارية
        admin_notes: 'تم تحديث الطلب آلياً - مراجعة دورية'
      })
      .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()) // آخر 60 يوم
      .in('status', ['pending', 'quoted'])
      .select('id, client_name, status')

    if (updateError) {
      console.log('❌ خطأ في التحديث التلقائي:', updateError.message)
    } else if (updatedRequests && updatedRequests.length > 0) {
      console.log(`✅ تم تحديث ${updatedRequests.length} طلب آلياً`)
    }

  } catch (error) {
    console.error('❌ خطأ في الإجراءات التلقائية:', error.message)
  }
}

// تشغيل السكريبت
console.log('🚀 بدء معالجة الطلبات العالقة...')
processStuckRequests()
  .then(() => {
    console.log('\n❓ هل تريد تنفيذ الإجراءات التلقائية؟')
    console.log('تشغيل: node process-stuck-requests.js --auto')
  })
  .catch(console.error)

// التحقق من المعامل للتشغيل التلقائي
if (process.argv.includes('--auto')) {
  performAutomaticActions()
}