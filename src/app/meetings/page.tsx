import Link from 'next/link'
export const metadata = {
  title: 'تواصل النخبة - الاجتماعات',
  description: 'جدولة اجتماعات Google Meet وربطها بمهام فريق تواصل النخبة، مع تقويم للمشاركين وتذكيرات وحماية جلسة الدوام.',
}
export default function MeetingsAboutPage() {
  return <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-12 text-cream md:py-20" dir="rtl">
    <section className="rounded-3xl border border-gold/30 bg-[#0b2036]/95 p-7 shadow-xl md:p-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="تواصل النخبة" className="mb-7 h-20 w-20 rounded-2xl bg-white object-contain p-2"/>
      <p className="text-sm font-bold text-gold">Google Calendar · Google Meet</p>
      <h1 className="mt-3 text-3xl font-black md:text-5xl">تواصل النخبة - الاجتماعات</h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-cream/85">مساحة اجتماعات فريق تواصل النخبة. يجد المشاركون مواعيدهم في لوحة الأداء والتقويم، وينضمون من الموقع على جهاز الدوام.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/auth/login" className="rounded-xl bg-gold px-6 py-3 font-black text-[#10213a]">تسجيل الدخول</Link>
        <Link href="/policies#google-data" className="rounded-xl border border-gold/50 px-6 py-3 font-bold text-gold">خصوصية بيانات Google</Link>
      </div>
    </section>
    <section className="grid gap-4 md:grid-cols-2" aria-label="وظائف الاجتماعات">
      {[
        ['جدولة واضحة', 'ينشئ المدير والمخولون اجتماعات Google Meet، ويحددون المشاركين والمواعيد والتكرار ويربطون الاجتماع بالمهمة.'],
        ['تقويم لكل مشارك', 'تظهر الاجتماعات المخصصة لكل مستخدم في تقويم شهري وأسبوعي، مع رابط الانضمام والتذكير بالموعد.'],
        ['ربط اختياري بحساب المنظم', 'يربط المدير حساب Google المنظم المعتمد بموافقته. لا يحتاج المشاركون من الموظفين ربط حسابات Google الخاصة بهم لمشاهدة مواعيدهم داخل الموقع.'],
        ['استخدام محدد للبيانات', 'نطلب صلاحيات هوية الحساب وأحداث تقاويمه المملوكة لتشغيل الاجتماعات فقط. لا نطلب الوصول إلى البريد أو Drive. يمكن إلغاء التفويض وطلب حذف البيانات.'],
      ].map(([title,body])=><article key={title} className="rounded-2xl border border-white/15 bg-[#10243c]/95 p-6"><h2 className="text-xl font-black text-gold">{title}</h2><p className="mt-3 text-sm leading-7 text-cream/85">{body}</p></article>)}
    </section>
    <footer className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-gold">
      <Link href="/policies#google-data">الخصوصية وبيانات Google</Link><Link href="/policies#terms">شروط الاستخدام</Link><a href="mailto:support@nukhba.media">support@nukhba.media</a>
    </footer>
  </main>
}
