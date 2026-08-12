import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-auto w-full min-w-full self-stretch px-3 pb-3 pt-10 text-cream/80 md:px-5 md:pb-5">
      <div className="glass-panel-dark mx-auto w-full max-w-6xl rounded-lg px-5 py-8 md:px-8 md:py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-3 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="تواصل النخبة"
                className="h-14 w-auto rounded-lg bg-white/95 p-1 object-contain" />
            </div>
            <h3 className="mb-1 text-lg font-black text-cream md:text-xl">تواصل النخبة</h3>
            <p className="text-sm text-cream/60">اترك أثراً دائماً..</p>
            <p className="text-xs text-gold mt-2 tracking-wider">ADVERTISING & MARKETING</p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-cream md:mb-4">روابط سريعة</h4>
            <nav className="flex flex-col gap-2 text-xs md:text-sm">
              <Link href="/" className="text-cream/70 hover:text-gold transition-colors">الرئيسية</Link>
              <Link href="/services" className="text-cream/70 hover:text-gold transition-colors">الخدمات</Link>
              <Link href="/pricing" className="text-cream/70 hover:text-gold transition-colors">الأسعار</Link>
              <Link href="/policies" className="text-cream/70 hover:text-gold transition-colors">السياسات</Link>
              <Link href="/request" className="text-cream/70 hover:text-gold transition-colors">تقديم طلب</Link>
            </nav>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-cream md:mb-4">حسابي</h4>
            <nav className="flex flex-col gap-2 text-xs md:text-sm">
              <Link href="/auth/login" className="text-cream/70 hover:text-gold transition-colors">تسجيل الدخول</Link>
              <Link href="/auth/register" className="text-cream/70 hover:text-gold transition-colors">إنشاء حساب</Link>
              <Link href="/dashboard" className="text-cream/70 hover:text-gold transition-colors">لوحة التحكم</Link>
            </nav>
          </div>
        </div>

        <div className="mt-7 border-t border-cream/10 pt-5 text-center text-[11px] text-cream/40 md:mt-10 md:pt-6 md:text-xs">
          جميع الحقوق محفوظة &copy; {new Date().getFullYear()} تواصل النخبة · Tawasol Al-Nokhba
        </div>
      </div>
    </footer>
  )
}
