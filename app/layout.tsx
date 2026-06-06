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
  title: 'Playroom Admin — PS5 Manager',
  description: 'PS5 Playroom-ის ადმინ პანელი — სესიები, კასა, ტარიფები, თანამშრომლები',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

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
        {children}
      </body>
    </html>
  )
}
