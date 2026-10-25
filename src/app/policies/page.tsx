export const metadata = {
  title: 'السياسات | تواصل النخبة',
}

type PolicyItem = { head: string; body: string; href?: string; linkLabel?: string }
const sections: { id: string; title: string; items: PolicyItem[] }[] = [
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
    id: 'google-data',
    title: 'خصوصية ربط Google Calendar والاجتماعات',
    items: [
      {
        head: 'الخدمة والبيانات التي نصل إليها',
        body: 'تطبيق «تواصل النخبة - الاجتماعات» يتيح للحساب المنظم المعتمد ربط Google Calendar لإنشاء اجتماعات Google Meet من الموقع وتعديلها وإلغائها. نتحقق من بريد حساب Google ومعرّفه، ونستخدم صلاحية calendar.events.owned لإدارة أحداث التقاويم التي يملكها الحساب. يستخدم التطبيق التقويم الرئيسي لإنشاء الاجتماعات المرتبطة بالموقع وقراءة حالتها وتحديثها؛ ولا يطلب صلاحية Gmail أو ملفات Google Drive.',
      },
      {
        head: 'الغرض والمشاركة',
        body: 'تُستخدم بيانات Google لتشغيل الاجتماعات فقط: المواعيد والعناوين والمحاور والمشاركون ورابط الانضمام. تُرسل تفاصيل الاجتماع وعناوين المشاركين المحددين إلى Google لإعداد الحدث والدعوات، وتظهر داخل الموقع للمستخدمين المخولين وفق صلاحياتهم. قد تعالج شركات الاستضافة وقاعدة البيانات والبريد البيانات اللازمة لتقديم هذه الوظائف وفق تعليماتنا. لا نبيع بيانات Google، ولا نستخدمها للإعلانات أو التسويق أو تدريب نماذج الذكاء الاصطناعي.',
      },
      {
        head: 'التخزين والحماية',
        body: 'نحفظ معرّف الحدث ورابط Google Meet وبيانات الاجتماع لمتابعة العمل، ونحفظ رمز تجديد تفويض Google مشفرًا على الخادم. بيانات التفويض غير متاحة للموظفين أو للعامة. يقتصر الوصول إلى بيانات الاجتماعات على ما يلزم لإدارة العمل بحسب الصلاحيات، أو لمعالجة دعم طلبه المستخدم أو متطلبات الأمان.',
      },
      {
        head: 'إلغاء الوصول والاحتفاظ والحذف',
        body: 'يمكن للحساب المنظم إلغاء وصول التطبيق من صفحة اتصالات حساب Google في أي وقت. إلغاء التفويض يوقف الوصول اللاحق ولا يحذف تلقائيًا أحداث التقويم السابقة أو سجلات الاجتماعات داخل الموقع. نحتفظ بسجلات الاجتماعات اللازمة لمتابعة العمل إلى حين طلب حذفها أو انتهاء الحاجة إليها. لطلب حذف بيانات الربط أو الاجتماعات، تواصل مع support@nukhba.media وحدد الحساب والبيانات المطلوبة؛ قد تُستثنى السجلات التي يلزم الاحتفاظ بها للوفاء بالتزامات نظامية، مع تقييد استخدامها لهذا الغرض.',
        href: 'https://myaccount.google.com/connections',
        linkLabel: 'إدارة اتصالات حساب Google',
      },
      {
        head: 'الالتزام بسياسة Google والاستخدام المحدود',
        body: 'يلتزم استخدام ونقل بيانات مستخدمي Google بسياسة بيانات المستخدم لخدمات Google API، بما فيها متطلبات الاستخدام المحدود. Our use and transfer of Google user data comply with the Google API Services User Data Policy, including its Limited Use requirements.',
        href: 'https://developers.google.com/terms/api-services-user-data-policy',
        linkLabel: 'Google API Services User Data Policy',
      },
    ],
  },
  {
    id: 'refund',
    title: 'سياسة الاسترجاع والإلغاء',
    items: [
      {
        head: 'السياسة التفصيلية',
        body: 'تتوفر سياسة الاسترجاع واسترداد المبالغ التفصيلية في صفحة مستقلة، وتوضح الحالات التي تُدرس، وآلية القرار، والمدد التقديرية بحسب وسيلة الدفع.',
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
                        {item.href && <a href={item.href} className="mt-2 inline-block text-sm font-bold text-green underline underline-offset-4">{item.linkLabel}</a>}
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
