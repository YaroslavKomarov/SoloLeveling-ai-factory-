'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createLogger } from '@/lib/logger'

const logger = createLogger('Navigation')

const navItems = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/today', label: 'Today' },
  { href: '/app/goals', label: 'Skills Tree' },
  { href: '/app/knowledge', label: 'Knowledge' },
  { href: '/app/settings', label: 'Settings' },
]

export function Navigation() {
  const pathname = usePathname()
  logger.debug('rendered', { pathname })

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        backgroundColor: '#0a0c10',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          height: '100%',
        }}
      >
        {/* Logo / brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 1.5rem',
            borderRight: '1px solid rgba(255, 255, 255, 0.05)',
            minWidth: '180px',
          }}
        >
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.875rem',
              fontWeight: 600,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow: '0 0 15px rgba(255, 255, 255, 0.3)',
            }}
          >
            Solo Leveling
          </span>
        </div>

        {/* Nav links */}
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.75rem',
                fontWeight: 400,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                backgroundColor: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                textShadow: isActive ? '0 0 6px rgba(255, 255, 255, 0.3)' : 'none',
                transition: 'color 0.2s ease, background-color 0.2s ease',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
