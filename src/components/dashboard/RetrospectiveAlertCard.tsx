'use client'

/**
 * RetrospectiveAlertCard — purple alert shown when a weekly retrospective is pending.
 * Only rendered by the dashboard page when pendingRetro is not null.
 */
import { motion } from 'framer-motion'
import { scaleIn } from '@/lib/animations/variants'
import { useMotionSafe } from '@/lib/animations/useMotionSafe'

interface RetrospectiveAlertCardProps {
  retroId: string
  weekStart: string
}

export function RetrospectiveAlertCard({ weekStart }: RetrospectiveAlertCardProps) {
  const variants = useMotionSafe(scaleIn)

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      style={{
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.75rem',
            fontWeight: 400,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#a855f7',
            margin: 0,
            marginBottom: '0.3rem',
          }}
        >
          Weekly Retrospective Pending
        </p>
        <p
          style={{
            fontFamily: 'Cormorant, Georgia, serif',
            fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.6)',
            margin: 0,
            marginBottom: '0.2rem',
          }}
        >
          Complete your weekly review to unlock insights and adapt your plan.
        </p>
        <span
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.5625rem',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          Week of {weekStart}
        </span>
      </div>

      {/* The retrospective wizard auto-opens via the layout gate when the user
          navigates to /app/dashboard. Clicking this navigates back to dashboard
          to trigger the gate (useful if user dismissed via non-standard path). */}
      <a
        href="/app/dashboard"
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.625rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#a855f7',
          border: '1px solid rgba(168,85,247,0.5)',
          padding: '0.5rem 1rem',
          textDecoration: 'none',
          flexShrink: 0,
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(168,85,247,0.15)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent'
        }}
      >
        Begin Review
      </a>
    </motion.div>
  )
}
