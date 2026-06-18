import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-dark text-cream/80 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="تواصل النخبة"
                className="h-16 w-auto object-contain bg-cream/95 rounded-xl p-1" />
            </div>
            <h3 className="text-xl font-black text-cream mb-1">تواصل النخبة</h3>
            <p className="text-sm text-cream/60">اترك أثراً دائماً..</p>
            <p className="text-xs text-gold mt-2 tracking-wider">ADVERTISING & MARKETING</p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-cream mb-4">روابط سريعة</h4>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/" className="text-cream/70 hover:text-gold transition-colors">الرئيسية</Link>
              <Link href="/services" className="text-cream/70 hover:text-gold transition-colors">الخدمات</Link>
              <Link href="/pricing" className="text-cream/70 hover:text-gold transition-colors">الأسعار</Link>
              <Link href="/policies" className="text-cream/70 hover:text-gold transition-colors">السياسات</Link>
              <Link href="/request" className="text-cream/70 hover:text-gold transition-colors">تقديم طلب</Link>
            </nav>
          </div>

          <div>
            <h4 className="text-sm font-bold text-cream mb-4">حسابي</h4>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/auth/login" className="text-cream/70 hover:text-gold transition-colors">تسجيل الدخول</Link>
              <Link href="/auth/register" className="text-cream/70 hover:text-gold transition-colors">إنشاء حساب</Link>
              <Link href="/dashboard" className="text-cream/70 hover:text-gold transition-colors">لوحة التحكم</Link>
            </nav>
          </div>
        </div>

        <div className="border-t border-cream/10 mt-10 pt-6 text-center text-xs text-cream/40">
          جميع الحقوق محفوظة &copy; {new Date().getFullYear()} تواصل النخبة · Tawasol Al-Nokhba
        </div>
      </div>
    </footer>
  )
}
