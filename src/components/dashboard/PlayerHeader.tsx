'use client'

/**
 * PlayerHeader — hero section of the Dashboard Command Center.
 * Displays the player's level badge, display name, and XP progress bar.
 */
import { motion } from 'framer-motion'
import { Progress } from '@/components/ui/Progress'
import { fadeInUp } from '@/lib/animations/variants'
import { useMotionSafe } from '@/lib/animations/useMotionSafe'

interface PlayerHeaderProps {
  displayName: string | null
  level: number
  xp: number
  xpToNext: number
}

export function PlayerHeader({ displayName, level, xp, xpToNext }: PlayerHeaderProps) {
  const variants = useMotionSafe(fadeInUp)
  const xpPercent = Math.round((xp / xpToNext) * 100)

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      {/* Level badge */}
      <div
        style={{
          width: '72px',
          height: '72px',
          flexShrink: 0,
          border: '1px solid rgba(255, 255, 255, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textShadow: '0 0 12px rgba(255, 255, 255, 0.5)',
          position: 'relative',
        }}
      >
        {/* Corner brackets */}
        <span style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderTop: '1px solid rgba(255,255,255,0.8)', borderLeft: '1px solid rgba(255,255,255,0.8)' }} />
        <span style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderTop: '1px solid rgba(255,255,255,0.8)', borderRight: '1px solid rgba(255,255,255,0.8)' }} />
        <span style={{ position: 'absolute', bottom: 3, left: 3, width: 8, height: 8, borderBottom: '1px solid rgba(255,255,255,0.8)', borderLeft: '1px solid rgba(255,255,255,0.8)' }} />
        <span style={{ position: 'absolute', bottom: 3, right: 3, width: 8, height: 8, borderBottom: '1px solid rgba(255,255,255,0.8)', borderRight: '1px solid rgba(255,255,255,0.8)' }} />

        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.5rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          Level
        </span>
        <span
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1,
          }}
        >
          {level}
        </span>
      </div>

      {/* Name + XP block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {displayName && (
          <p
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '1.125rem',
              fontWeight: 400,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#ffffff',
              margin: 0,
              marginBottom: '0.625rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </p>
        )}

        <Progress value={xp} max={xpToNext} color="white" height="0.375rem" />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '0.375rem',
          }}
        >
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.6875rem',
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.05em',
            }}
          >
            {xp.toLocaleString()} / {xpToNext.toLocaleString()} XP
          </span>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.6875rem',
              color: 'rgba(255, 255, 255, 0.3)',
              letterSpacing: '0.05em',
            }}
          >
            {xpPercent}%
          </span>
        </div>
      </div>
    </motion.div>
  )
}
