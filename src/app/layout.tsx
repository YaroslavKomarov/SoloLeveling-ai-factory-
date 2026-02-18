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
