export const metadata = {
  title: 'السياسات | تواصل النخبة',
}

const sections = [
  {
    id: 'terms',
    title: 'شروط الاستخدام',
    items: [
      {
        head: 'قبول الشروط',
        body: 'باستخدامك منصة تواصل النخبة، فإنك توافق على الالتزام بكامل الشروط والأحكام الواردة في هذه الصفحة.',
      },
      {
        head: 'طبيعة الخدمة',
        body: 'المحتوى المقدم يجب أن يكون حقيقياً وموثقاً وغير مضلل، وتحتفظ المنصة بحق رفض أي محتوى يخالف سياساتها دون إبداء الأسباب.',
      },
      {
        head: 'المحتوى المحظور',
        body: 'يمنع المحتوى المخالف للشريعة الإسلامية أو الأنظمة السعودية، والمحتوى السياسي المثير للجدل، والادعاءات الكاذبة أو المضللة، وانتهاك حقوق الملكية الفكرية.',
      },
      {
        head: 'مواعيد التنفيذ',
        body: 'يُنفَّذ النشر خلال 24–48 ساعة من التحقق من الدفع. لمواعيد النشر المحددة، يُرجى التنسيق المسبق مع فريق العمل.',
      },
      {
        head: 'المسؤولية القانونية',
        body: 'صاحب الطلب مسؤول قانونياً عن صحة المعلومات المقدمة، والمنصة غير مسؤولة عن أي نزاعات ناتجة عن المحتوى المنشور.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'سياسة الخصوصية',
    items: [
      {
        head: 'حفظ البيانات',
        body: 'تُحفَظ بياناتك الشخصية في قواعد بيانات آمنة ومحمية، ولا يصل إليها إلا فريق العمل المخوَّل بذلك.',
      },
      {
        head: 'استخدام البيانات',
        body: 'تُستخدَم البيانات لتنفيذ الطلبات، تحسين جودة الخدمة، والتواصل المستقبلي بشأن العروض والإشعارات.',
      },
      {
        head: 'المشاركة مع أطراف ثالثة',
        body: 'لا تُشارَك بياناتك مع أي طرف ثالث دون إذن صريح منك، باستثناء ما تستوجبه الأنظمة الرسمية في المملكة.',
      },
      {
        head: 'حقك في الحذف',
        body: 'يمكنك طلب حذف بياناتك الشخصية في أي وقت بمراسلتنا عبر البريد الرسمي للمنصة.',
      },
    ],
  },
  {
    id: 'refund',
    title: 'سياسة الاسترجاع والإلغاء',
    items: [
      {
        head: 'قبل تنفيذ النشر',
        body: 'يمكن إلغاء الطلب واسترجاع كامل المبلغ قبل بدء عملية النشر بشرط إبلاغ فريق العمل خلال مدة معقولة.',
      },
      {
        head: 'بعد تنفيذ النشر',
        body: 'لا يُعاد المبلغ بعد نشر المحتوى لأي سبب، إذ يكون الالتزام التعاقدي قد تمَّ تنفيذه.',
      },
      {
        head: 'رفض المحتوى من قبل المنصة',
        body: 'في حال رفض المحتوى لمخالفته الشروط، يُعاد المبلغ كاملاً خلال 3 أيام عمل من تاريخ الرفض.',
      },
      {
        head: 'تأخر التنفيذ',
        body: 'في حال تأخر التنفيذ لأسباب من جهتنا تتجاوز المدة المتفق عليها، يحق للعميل المطالبة بتعويض جزئي يحدده الفريق.',
      },
    ],
  },
]

export default function PoliciesPage() {
  return (
    <div className="flex-1 bg-cream">
        <section className="bg-gradient-to-bl from-dark via-dark/95 to-green text-cream py-16 md:py-20">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-5xl font-black mb-3">السياسات</h1>
            <p className="text-cream/70 text-base">شروط الاستخدام والخصوصية وسياسة الاسترجاع</p>
          </div>
        </section>

        <section className="py-12">
          <div className="max-w-4xl mx-auto px-4">
            <nav className="bg-card border border-border rounded-2xl p-4 mb-8 flex flex-wrap gap-3 justify-center text-sm">
              {sections.map(s => (
                <a key={s.id} href={`#${s.id}`}
                  className="px-4 py-2 rounded-lg bg-cream hover:bg-green/10 hover:text-green transition-colors text-dark font-medium">
                  {s.title}
                </a>
              ))}
            </nav>

            <div className="space-y-8">
              {sections.map(s => (
                <section key={s.id} id={s.id} className="bg-card border border-border rounded-2xl p-6 scroll-mt-24">
                  <h2 className="text-2xl font-black text-dark mb-5 pb-3 border-b border-border">{s.title}</h2>
                  <div className="space-y-5">
                    {s.items.map(item => (
                      <div key={item.head}>
                        <h3 className="font-bold text-dark text-base mb-1">{item.head}</h3>
                        <p className="text-sm text-muted leading-relaxed">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <p className="text-center text-xs text-muted mt-10">
              آخر تحديث: {new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'long' }).format(new Date())}
            </p>
          </div>
        </section>
    </div>
  )
}
