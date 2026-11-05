import First1Shell from '@/app/auth/sso/first1-shell'
import '@/app/auth/sso/sso.css'
import './checkout.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'الدفع | أول سعودي', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export default function PartnerCheckoutLayout({ children }: { children: React.ReactNode }) { return <div className="first1-checkout-page"><First1Shell>{children}</First1Shell></div> }
