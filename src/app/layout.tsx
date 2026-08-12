import type { Metadata, Viewport } from 'next'
import { Cairo } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/Toast'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import DiscountPopup from '@/components/ui/DiscountPopup'

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
})

export const metadata: Metadata = {
  title: 'تواصل النخبة',
  description: 'منصة احترافية لنشر أخبارك وإنجازاتك عبر أبرز المؤثرين في السعودية',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.className} h-full`}>
      <body className="site-page min-h-full flex flex-col antialiased overflow-x-hidden">
        <ToastProvider>
          <Header />
          <main className="flex-1 flex flex-col min-w-0">{children}</main>
          <Footer />
          <DiscountPopup />
        </ToastProvider>
      </body>
    </html>
  )
}
