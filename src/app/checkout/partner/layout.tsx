import First1Shell from '@/app/auth/sso/first1-shell'
import '@/app/auth/sso/sso.css'
import './checkout.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'الدفع | أول سعودي', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export default function PartnerCheckoutLayout({ children }: { children: React.ReactNode }) {
  return <div className="first1-checkout-page">
    <First1Shell>{children}</First1Shell>
    <a className="f1-whatsapp" href="https://wa.me/966543278747" target="_blank" rel="noopener noreferrer" aria-label="تواصل معنا عبر واتساب" title="تواصل معنا عبر واتساب">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.52 3.48A11.89 11.89 0 0 0 12.05 0C5.48 0 .13 5.35.13 11.93c0 2.1.55 4.15 1.6 5.96L.03 24l6.25-1.64a11.9 11.9 0 0 0 5.77 1.47h.01C18.63 23.83 24 18.48 24 11.9c0-3.19-1.24-6.18-3.48-8.42zM12.05 21.8a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.71.97.99-3.62-.24-.37a9.87 9.87 0 0 1-1.52-5.26c0-5.46 4.44-9.9 9.9-9.9a9.83 9.83 0 0 1 7 2.9 9.83 9.83 0 0 1 2.9 7c0 5.46-4.45 9.9-9.92 9.9zm5.43-7.41c-.3-.15-1.76-.87-2.03-.97-.28-.1-.48-.15-.68.15s-.77.97-.94 1.17c-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.58-.35z"/></svg>
    </a>
  </div>
}
