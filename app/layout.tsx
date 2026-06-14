import type { Metadata } from 'next'
import { Noto_Sans_Georgian, Geist_Mono } from 'next/font/google'
import './globals.css'

const notoGeorgian = Noto_Sans_Georgian({
  variable: '--font-noto-georgian',
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
})
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://martelounge.ge'),
  title: {
    default: 'Martelounge — PlayStation კლუბის მართვის სისტემა',
    template: '%s · Martelounge',
  },
  description:
    'PS5 კლუბებისა და gaming lounge-ების სრული ოპერაციული სისტემა: სესიები, ბარი/POS, კასა, ბუღალტერია, თანამშრომლები, ტურნირები, ონლაინ ჯავშნები და AI. დაიწყე 14 დღე უფასოდ.',
  keywords: [
    'gaming lounge', 'PlayStation კლუბი', 'PS5 კლუბი', 'კლუბის მართვის სისტემა',
    'gaming lounge software', 'POS', 'Martelounge', 'მართელაუნჯი',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Martelounge',
    locale: 'ka_GE',
    url: 'https://martelounge.ge',
    title: 'Martelounge — PlayStation კლუბის მართვის სისტემა',
    description:
      'PS5 კლუბის სრული ოპერაციული სისტემა — სესიები, ბარი, კასა, ბუღალტერია, ტურნირები, AI. 14 დღე უფასოდ.',
  },
  twitter: { card: 'summary_large_image' },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-512.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Martelounge',
  },
}

export const viewport = {
  themeColor: '#1c1f27',
}

import PwaRegister from '@/components/pwa-register'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ka"
      className={`dark ${notoGeorgian.variable} ${geistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased bg-background">
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
