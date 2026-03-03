'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { createLogger } from '@/lib/logger'
import { useIsMobile } from '@/hooks/useIsMobile'

const logger = createLogger('Navigation')

const navItems = [
  { href: '/app/dashboard', label: 'Command Center' },
  { href: '/app/today', label: 'Today' },
  { href: '/app/goals', label: 'Skills Tree' },
  { href: '/app/knowledge', label: 'Knowledge' },
  { href: '/app/settings', label: 'Settings' },
]

export function Navigation() {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  logger.debug('rendered', { pathname, isMobile, menuOpen })

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

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
      {isMobile ? (
        /* ── MOBILE ── */
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 1rem',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Brand abbreviated */}
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow: '0 0 15px rgba(255,255,255,0.3)',
            }}
          >
            SL
          </span>

          {/* Hamburger / Close toggle */}
          <button
            onClick={() => {
              const next = !menuOpen
              setMenuOpen(next)
              logger.debug('[Navigation] mobile menu opened/closed', { open: next })
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>

          {/* Dropdown overlay */}
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'var(--header-height)',
                left: 0,
                right: 0,
                backgroundColor: '#0a0c10',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                zIndex: 19,
              }}
            >
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: 'block',
                      padding: '1rem 1.5rem',
                      fontFamily: 'Cinzel, serif',
                      fontSize: '0.8rem',
                      fontWeight: 400,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      textDecoration: 'none',
                      color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
                      backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── DESKTOP (unchanged) ── */
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
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {item.label}
                {/* Hover underline — only show on non-active links */}
                {!isActive && (
                  <motion.span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '20%',
                      right: '20%',
                      height: '1px',
                      backgroundColor: 'rgba(255, 255, 255, 0.4)',
                      scaleX: 0,
                      originX: 0,
                    }}
                    whileHover={{ scaleX: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
