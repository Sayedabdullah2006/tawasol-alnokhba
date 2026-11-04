import type { ReactNode } from 'react'

export default function First1Shell({children}:{children:ReactNode}) {
 return <div dir="rtl" className="sso-first1 first1-auth-shell">
  <a className="first1-auth-skip" href="#first1-auth-main">تخطَّ إلى المحتوى</a>
  <header className="first1-auth-header"><div className="first1-auth-header-inner">
   <a href="https://first1saudi.net/" className="first1-auth-logo" aria-label="أول سعودي — الرئيسية"><img src="/images/first1saudi-logo.svg" alt="أول سعودي" width="180" height="72"/></a>
   <nav aria-label="الموقع" className="first1-auth-links"><a href="https://first1saudi.net/">الرئيسية</a><a href="https://first1saudi.net/?f1_sections=1">المجالات</a><a href="https://first1saudi.net/?f1_archive=1">الأرشيف</a><a href="https://first1saudi.net/contact">تواصل معنا</a></nav>
   <a className="first1-auth-publish" href="https://first1saudi.net/services">انشر إنجازك</a>
  </div></header>
  <main id="first1-auth-main" className="first1-auth-main">{children}</main>
 </div>
}
