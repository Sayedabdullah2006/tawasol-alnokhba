/**
 * أقسام «مجلة المبدعين» + التصنيف التلقائي للمنشورات.
 *
 * مجموعة أقسام ثابتة جاذبة للقارئ (بدل تمرير فئة المصدر الخام). التصنيف هجين:
 *   1) مصنّف قواعد بالكلمات (سريع/مجاني/حتمي) — يُستخدم في كل المسارات.
 *   2) احتياطي بالذكاء الاصطناعي — فقط عند عدم تطابق القواعد (مسار الكتابة).
 *
 * هذا الملف نقيّ (بلا استيراد خادمي على المستوى الأعلى) ليُستورَد بأمان في
 * مكوّنات الواجهة (قائمة الأقسام). استدعاء الذكاء الاصطناعي يستورد openai ديناميكياً.
 */

export interface ShowcaseSection {
  name: string       // الاسم المعروض (يتضمّن إيموجي)
  keywords: string[] // كلمات/عبارات دالّة على القسم
}

// الترتيب مهمّ: الأسبق يفوز عند تعادل عدد التطابقات (الأكثر تحديداً أولاً).
export const SHOWCASE_SECTIONS: ShowcaseSection[] = [
  {
    name: '🌟 رائدات سعوديات',
    keywords: ['أول سعودية', 'أول امرأة', 'أول فتاة', 'أول لاعبة', 'أول رائدة', 'أول مهندسة', 'أول طبيبة', 'أول عالمة', 'أول مخرجة', 'سيدة أعمال سعودية', 'أول قاضية', 'أول سفيرة'],
  },
  {
    name: '🚀 الفضاء والطيران',
    keywords: ['رائد فضاء', 'رائدة فضاء', 'رواد الفضاء', 'الفضاء', 'فضائية', 'محطة الفضاء', 'مدار', 'ناسا', 'صاروخ', 'مركبة فضائية', 'قمر صناعي', 'طيران', 'طيّار', 'طيار'],
  },
  {
    name: '🔬 علوم واختراعات',
    keywords: ['اختراع', 'مخترع', 'براءة', 'براءات', 'بحث علمي', 'نوبل', 'عالم', 'عالمة', 'باحث', 'باحثة', 'نانو', 'فيزياء', 'كيمياء', 'هندسة', 'مختبر', 'اكتشاف', 'دكتوراه', 'تقنية', 'ذكاء اصطناعي', 'ابتكار'],
  },
  {
    name: '🏅 أبطال الرياضة',
    keywords: ['لاعب', 'لاعبة', 'رياضي', 'رياضة', 'أولمبياد', 'أولمبية', 'أولمبي', 'ميدالية', 'بطولة', 'بطل', 'بطلة', 'دوري', 'كرة', 'كاراتيه', 'تايكوندو', 'جودو', 'عدّاء', 'سباحة', 'فروسية', 'رماية', 'نادي', 'منتخب', 'مونديال', 'كأس', 'أثقال', 'ألعاب القوى'],
  },
  {
    name: '🎬 فنون وثقافة',
    keywords: ['فنان', 'فنانة', 'سينما', 'فيلم', 'مخرج', 'مخرجة', 'ممثل', 'ممثلة', 'رواية', 'روائي', 'كاتب', 'أديب', 'شاعر', 'تشكيلي', 'رسام', 'موسيقى', 'مسرح', 'تصميم', 'خط عربي', 'ثقافة', 'معرض فني', 'بوكر', 'أدب', 'تراث'],
  },
  {
    name: '💼 ريادة وأعمال',
    keywords: ['رائد أعمال', 'ريادة', 'شركة', 'استثمار', 'مشروع', 'تأسيس', 'ناشئة', 'اقتصاد', 'تجارة', 'مدير تنفيذي', 'أعمال', 'علامة تجارية', 'ملياردير', 'يونيكورن'],
  },
  {
    name: '👑 شخصيات وطنية',
    keywords: ['ملك', 'أمير', 'أميرة', 'مؤسس', 'موحّد', 'موحد', 'وزير', 'قائد', 'شيخ', 'حاكم', 'الدولة السعودية', 'ولي العهد', 'رمز وطني'],
  },
  {
    name: '🌍 إنجازات عالمية',
    keywords: ['غينيس', 'جينيس', 'رقم قياسي', 'قياسي', 'جائزة عالمية', 'جائزة دولية', 'أول عربي', 'أول في العالم', 'الأول عالمياً', 'عالمياً', 'دولياً', 'مسابقة عالمية', 'اعتراف دولي', 'تصنيف عالمي', 'وسام'],
  },
]

export const FALLBACK_SECTION = '✨ منوّعات'
export const SECTION_NAMES: string[] = [...SHOWCASE_SECTIONS.map(s => s.name), FALLBACK_SECTION]

function isKnownSection(name: string): boolean {
  return SECTION_NAMES.includes(name)
}

/** مصنّف القواعد: يعيد اسم القسم الأعلى تطابقاً، أو null إن لم يتطابق شيء. */
export function classifySectionByRules(text: string): string | null {
  const hay = (text || '').toLowerCase()
  let best: { name: string; score: number } | null = null
  for (const sec of SHOWCASE_SECTIONS) {
    let score = 0
    for (const kw of sec.keywords) if (hay.includes(kw.toLowerCase())) score++
    // الترتيب يكسر التعادل (الأسبق في المصفوفة أكثر تحديداً)
    if (score > 0 && (!best || score > best.score)) best = { name: sec.name, score }
  }
  return best?.name ?? null
}

/**
 * تطبيع للمسار القرائي (sync, بلا ذكاء اصطناعي): إن كانت الفئة الخام قسماً معروفاً
 * تُبقى، وإلا تُصنَّف بالقواعد من النص، وإلا «منوّعات». يُستخدم في showcase API.
 */
export function normalizeSection(rawCategory: string | null | undefined, title?: string, content?: string): string {
  const raw = (rawCategory ?? '').trim()
  if (raw && isKnownSection(raw)) return raw
  return classifySectionByRules(`${raw} ${title ?? ''} ${content ?? ''}`) ?? FALLBACK_SECTION
}

/**
 * تصنيف لمسار الكتابة (async): القواعد أولاً، ثم الذكاء الاصطناعي عند عدم التطابق.
 * يُخزّن القسم النظيف عند توليد/تضمين المنشور.
 */
export async function classifySection(args: { title?: string; content?: string; raw?: string }): Promise<string> {
  const combined = `${args.raw ?? ''} ${args.title ?? ''} ${args.content ?? ''}`
  // إن كانت الفئة الخام قسماً معروفاً، اعتمدها مباشرة.
  const raw = (args.raw ?? '').trim()
  if (raw && isKnownSection(raw)) return raw

  const byRules = classifySectionByRules(combined)
  if (byRules) return byRules

  // احتياطي: استدعاء واحد للذكاء الاصطناعي (يُستورَد openai ديناميكياً).
  try {
    const { getOpenAI } = await import('./openai')
    const openai = getOpenAI()
    const list = SECTION_NAMES.join('\n')
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.5',
      messages: [
        {
          role: 'system',
          content:
            'صنّف محتوى المنشور التالي ضمن قسم واحد فقط من القائمة، وأعد اسم القسم حرفياً (مع الإيموجي) بلا أي نص آخر. ' +
            `إن لم يناسب أياً منها بوضوح فأعد «${FALLBACK_SECTION}».\n\nالأقسام:\n${list}`,
        },
        { role: 'user', content: `${args.title ?? ''}\n${args.content ?? ''}`.trim() },
      ],
    })
    const out = (completion.choices[0]?.message?.content ?? '').trim()
    if (isKnownSection(out)) return out
    // مطابقة مرنة: ابحث عن اسم قسم وارد ضمن الناتج
    const found = SECTION_NAMES.find(n => out.includes(n) || out.includes(n.replace(/^[^؀-ۿ]+/, '').trim()))
    if (found) return found
  } catch { /* تجاهل — نرجع للاحتياطي */ }
  return FALLBACK_SECTION
}
