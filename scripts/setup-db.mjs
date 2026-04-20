import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  console.log('1. Creating categories table...')
  const { error: e1 } = await supabase.rpc('exec_sql', { sql: `
    CREATE TABLE IF NOT EXISTS categories (
      id text PRIMARY KEY,
      name_ar text NOT NULL,
      icon text NOT NULL DEFAULT '📋',
      description text,
      has_sub_option boolean DEFAULT false,
      sub_option_title text,
      sub_options jsonb,
      client_types jsonb,
      sort_order int DEFAULT 0,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
  `})
  if (e1) console.log('  Note:', e1.message)
  else console.log('  OK')

  // RLS policies
  await supabase.rpc('exec_sql', { sql: `
    DROP POLICY IF EXISTS "anyone_read_categories" ON categories;
    CREATE POLICY "anyone_read_categories" ON categories FOR SELECT USING (true);
    DROP POLICY IF EXISTS "admin_manage_categories" ON categories;
    CREATE POLICY "admin_manage_categories" ON categories FOR ALL USING (is_admin());
  `}).catch(() => {})

  console.log('2. Inserting categories...')
  const categories = [
    { id: 'inventions', name_ar: 'الاختراعات', icon: '💡', description: 'اختراع أو ابتكار جديد', has_sub_option: true, sub_option_title: 'هل لديك براءة اختراع؟', sub_options: [{ id: 'with_patent', icon: '✅', label: 'نعم — لدي براءة اختراع', hint: 'سيُطبق إعفاء خاص' }, { id: 'no_patent', icon: '❌', label: 'لا — ليس لدي براءة', hint: 'سيُطبق خصم خاص' }], client_types: ['individual'], sort_order: 1 },
    { id: 'competitions', name_ar: 'المسابقات', icon: '🏆', description: 'فوز أو تميز في مسابقة', has_sub_option: true, sub_option_title: 'ما مركزك في المسابقة؟', sub_options: [{ id: 'first_place', icon: '🥇', label: 'المركز الأول', hint: 'سيُطبق إعفاء خاص' }, { id: 'other_place', icon: '🎖️', label: 'مركز آخر', hint: 'سيُطبق خصم خاص' }], client_types: ['individual'], sort_order: 2 },
    { id: 'books', name_ar: 'كتب ومصنفات', icon: '📚', description: 'كتاب أو بحث أو مصنف', client_types: ['individual'], sort_order: 3 },
    { id: 'events', name_ar: 'فعاليات ومؤتمرات', icon: '🎯', description: 'مؤتمر أو معرض أو فعالية', sort_order: 4 },
    { id: 'certs', name_ar: 'شهادات احترافية', icon: '🎖️', description: 'شهادة مهنية أو تخصصية', client_types: ['individual'], sort_order: 5 },
    { id: 'graduation', name_ar: 'تهنئة تخرج', icon: '🎓', description: 'تخرج أو إنجاز أكاديمي', client_types: ['individual'], sort_order: 6 },
    { id: 'appointment', name_ar: 'تعيين منصب', icon: '👔', description: 'تعيين أو ترقية مهنية', sort_order: 7 },
    { id: 'award', name_ar: 'جائزة خاصة', icon: '🥇', description: 'جائزة أو تكريم', client_types: ['individual'], sort_order: 8 },
    { id: 'cv', name_ar: 'سيرة ذاتية', icon: '👤', description: 'ملف شخصي احترافي', client_types: ['individual'], sort_order: 9 },
    { id: 'product', name_ar: 'منتج تجاري', icon: '🚀', description: 'منتج أو خدمة تجارية', client_types: ['individual', 'business'], sort_order: 10 },
    { id: 'research', name_ar: 'بحث علمي', icon: '🔬', description: 'بحث أو دراسة علمية', client_types: ['individual'], sort_order: 11 },
    { id: 'charity', name_ar: 'مبادرة خيرية', icon: '❤️', description: 'مبادرة أو عمل خيري', client_types: ['charity'], sort_order: 12 },
    { id: 'government', name_ar: 'إعلان حكومي', icon: '🏛️', description: 'خدمة أو إعلان حكومي', client_types: ['government'], sort_order: 13 },
  ]

  for (const cat of categories) {
    const { error } = await supabase.from('categories').upsert(cat)
    if (error) console.log(`  ${cat.id}: ${error.message}`)
    else console.log(`  ${cat.id}: OK`)
  }

  console.log('3. Creating extras table...')
  const { error: e2 } = await supabase.rpc('exec_sql', { sql: `
    CREATE TABLE IF NOT EXISTS extras (
      id text PRIMARY KEY,
      name_ar text NOT NULL,
      icon text NOT NULL DEFAULT '📋',
      default_price numeric NOT NULL DEFAULT 0,
      category_only text,
      sort_order int DEFAULT 0,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
  `})
  if (e2) console.log('  Note:', e2.message)
  else console.log('  OK')

  await supabase.rpc('exec_sql', { sql: `
    DROP POLICY IF EXISTS "anyone_read_extras" ON extras;
    CREATE POLICY "anyone_read_extras" ON extras FOR SELECT USING (true);
    DROP POLICY IF EXISTS "admin_manage_extras" ON extras;
    CREATE POLICY "admin_manage_extras" ON extras FOR ALL USING (is_admin());
  `}).catch(() => {})

  console.log('4. Inserting extras...')
  const extrasData = [
    { id: 'bilingual', name_ar: 'صياغة المحتوى باللغتين', icon: '✍️', default_price: 300, sort_order: 1 },
    { id: 'mention', name_ar: 'منشن في القناة', icon: '🔔', default_price: 200, sort_order: 2 },
    { id: 'story', name_ar: 'ستوري في القناة', icon: '📱', default_price: 150, sort_order: 3 },
    { id: 'encyclopedia', name_ar: 'إضافة للموسوعة الرقمية', icon: '📖', default_price: 500, sort_order: 4 },
    { id: 'pin6', name_ar: 'تثبيت 6 أشهر', icon: '📌', default_price: 100, sort_order: 5 },
    { id: 'pin12', name_ar: 'تثبيت 12 شهر', icon: '📍', default_price: 200, sort_order: 6 },
    { id: 'repost', name_ar: 'إعادة نشر', icon: '🔄', default_price: 150, sort_order: 7 },
    { id: 'campaign', name_ar: 'حملة ترويجية متكاملة', icon: '📣', default_price: 1000, sort_order: 8 },
    { id: 'video', name_ar: 'فيديو جاهز', icon: '🎬', default_price: 400, sort_order: 9 },
    { id: 'report', name_ar: 'تقرير الأداء', icon: '📊', default_price: 800, sort_order: 10 },
    { id: 'plan', name_ar: 'خطة تسويقية شاملة', icon: '🗺️', default_price: 1500, sort_order: 11 },
    { id: 'website', name_ar: 'تصميم موقع إلكتروني', icon: '🌐', default_price: 5000, sort_order: 12 },
    { id: 'media', name_ar: 'تغطية إعلامية', icon: '📺', default_price: 10000, sort_order: 13 },
    { id: 'infographic', name_ar: 'تصميم انفوجرافيك', icon: '🎨', default_price: 300, category_only: 'cv', sort_order: 14 },
  ]

  for (const ext of extrasData) {
    const { error } = await supabase.from('extras').upsert(ext)
    if (error) console.log(`  ${ext.id}: ${error.message}`)
    else console.log(`  ${ext.id}: OK`)
  }

  console.log('5. Linking pricing to influencer...')
  await supabase.rpc('exec_sql', { sql: `
    ALTER TABLE pricing_config ADD COLUMN IF NOT EXISTS influencer_id uuid REFERENCES influencers(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_pricing_influencer ON pricing_config(influencer_id);
  `}).catch(() => {})

  // Copy default pricing to each influencer
  const { data: influencers } = await supabase.from('influencers').select('id')
  const { data: defaultPricing } = await supabase.from('pricing_config').select('*').eq('id', 'default').single()

  if (defaultPricing && influencers) {
    for (const inf of influencers) {
      const { error } = await supabase.from('pricing_config').upsert({
        id: 'inf_' + inf.id,
        influencer_id: inf.id,
        base_prices: defaultPricing.base_prices,
        extras_prices: defaultPricing.extras_prices,
        scope_multipliers: defaultPricing.scope_multipliers,
        image_multipliers: defaultPricing.image_multipliers,
        discount_table: defaultPricing.discount_table,
        max_discount: defaultPricing.max_discount,
        vat_rate: defaultPricing.vat_rate,
      })
      if (error) console.log(`  inf_${inf.id}: ${error.message}`)
      else console.log(`  inf_${inf.id}: OK`)
    }
  }

  console.log('\n✅ Done!')
  process.exit(0)
}

run()
