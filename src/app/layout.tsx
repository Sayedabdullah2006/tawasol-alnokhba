import type { Metadata } from 'next'
import { Cairo } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/Toast'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
})

export const metadata: Metadata = {
  title: 'تواصل النخبة',
  description: 'منصة احترافية لنشر أخبارك وإنجازاتك عبر أبرز المؤثرين في السعودية',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.className} h-full`}>
      <body className="min-h-full flex flex-col antialiased bg-cream">
        <ToastProvider>
          <Header />
          <main className="flex-1 flex flex-col">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  )
}
