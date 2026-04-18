import type { Metadata } from 'next'
import { Cinzel, Cormorant, Orbitron } from 'next/font/google'
import { AnimatedBackground } from '@/components/layout/AnimatedBackground'
import './globals.css'

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
})

const cormorant = Cormorant({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-orbitron',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Solo Leveling',
  description: 'ASE v3.0 — Adaptive Strategic Execution',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SoloLeveling',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${cormorant.variable} ${orbitron.variable}`}
    >
      <head>
        <meta name="theme-color" content="#0a0c10" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body
        style={{
          backgroundColor: '#0a0c10',
          color: '#ffffff',
          minHeight: '100vh',
          fontFamily: 'var(--font-cormorant), Georgia, serif',
          fontWeight: 300,
          overflowX: 'hidden',
        }}
      >
        <AnimatedBackground />
        <div style={{ position: 'relative', zIndex: 10 }}>
          {children}
        </div>
      </body>
    </html>
  )
}
