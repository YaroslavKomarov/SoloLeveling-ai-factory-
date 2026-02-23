'use client'

import { useEffect, useRef, useState } from 'react'
import { Settings, Dumbbell, Heart, Cpu, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Progress } from '@/components/ui/Progress'
import { useUserStore } from '@/store/user'
import { createLogger } from '@/lib/logger'

const logger = createLogger('UserPanel')

interface FatigueData {
  physical: number
  emotional: number
  intellectual: number
}

interface UserPanelProps {
  level?: number
  xp?: number
  xpToNext?: number
  displayName?: string | null
  fatigue?: FatigueData
}

// Corner bracket decorations for RPG-style frame
function CornerBrackets({
  size = 12,
  color = 'rgba(255, 255, 255, 0.5)',
  inset = false,
}: {
  size?: number
  color?: string
  inset?: boolean
}) {
  const o = inset ? 3 : -1
  const corners = [
    { top: o, left: o, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
    { top: o, right: o, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` },
    { bottom: o, left: o, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
    { bottom: o, right: o, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` },
  ]

  return (
    <>
      {corners.map((style, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            pointerEvents: 'none',
            ...style,
          }}
        />
      ))}
    </>
  )
}

export function UserPanel({
  level: initialLevel = 1,
  xp: initialXp = 0,
  xpToNext: initialXpToNext = 100,
  displayName = null,
  fatigue: initialFatigue = { physical: 0, emotional: 0, intellectual: 0 },
}: UserPanelProps) {
  const setUser = useUserStore((s) => s.setUser)
  const setFatigue = useUserStore((s) => s.setFatigue)
  const level = useUserStore((s) => s.level)
  const xp = useUserStore((s) => s.xp)
  const xpToNext = useUserStore((s) => s.xpToNext)
  const fatigue = useUserStore((s) => s.fatigue)

  // XP toast state: show "+N XP" floating indicator on XP gain
  const [xpToast, setXpToast] = useState<number | null>(null)
  const prevXpRef = useRef(initialXp)

  // Initialize store with server-fetched values on first render
  useEffect(() => {
    logger.debug('Initializing UserPanel store', { level: initialLevel, xp: initialXp })
    setUser({
      level: initialLevel,
      xp: initialXp,
      xpToNext: initialXpToNext,
      isLoaded: true,
    })
    setFatigue(initialFatigue)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show XP toast when XP increases
  useEffect(() => {
    const delta = xp - prevXpRef.current
    if (delta > 0) {
      logger.debug(`XP animation: +${delta} XP`)
      setXpToast(delta)
      const timeout = setTimeout(() => setXpToast(null), 1800)
      prevXpRef.current = xp
      return () => clearTimeout(timeout)
    }
    prevXpRef.current = xp
  }, [xp])

  logger.debug('Fatigue updated', { fatigue })

  const xpPercent = Math.round((xp / xpToNext) * 100)

  return (
    <aside
      style={{
        width: '100%',
        marginTop: '20px',
        height: 'var(--user-panel-height)',
        backgroundColor: 'rgba(15, 20, 25, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 4px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.08), 0 0 40px rgba(255, 255, 255, 0.03), inset 0 0 12px rgba(255, 255, 255, 0.04)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        backdropFilter: 'blur(6px)',
        position: 'relative',
      }}
    >
      {/* Panel corner brackets */}
      <CornerBrackets size={16} color="rgba(255, 255, 255, 0.45)" />

      {/* Left: Level avatar square — spans full panel height */}
      <div
        style={{
          width: '90px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '66px',
            height: '66px',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textShadow: '0 0 12px rgba(255, 255, 255, 0.5)',
          }}
        >
          <CornerBrackets size={8} color="rgba(255, 255, 255, 0.8)" inset />
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
      </div>

      {/* Middle: Two rows — XP bar + fatigue bars */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '0.625rem',
          padding: '0.875rem 1.5rem',
          minWidth: 0,
        }}
      >
        {/* Row 0: Display name */}
        {displayName && (
          <p
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.875rem',
              fontWeight: 400,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#ffffff',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </p>
        )}

        {/* Row 1: XP bar + labels */}
        <div style={{ position: 'relative' }}>
          <Progress value={xp} max={xpToNext} color="white" height="0.375rem" />

          {/* XP floating toast */}
          <AnimatePresence>
            {xpToast !== null && (
              <motion.span
                key="xp-toast"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: -2 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: 'absolute',
                  top: '-1.25rem',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.6rem',
                  color: '#ffffff',
                  textShadow: '0 0 8px rgba(255, 255, 255, 0.6)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                +{xpToast} XP
              </motion.span>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
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

        {/* Row 2: Fatigue bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <AnimatedFatigueBar
            icon={<Dumbbell size={13} strokeWidth={1.5} />}
            label="Physical"
            value={fatigue.physical}
            color="physical"
          />
          <AnimatedFatigueBar
            icon={<Heart size={13} strokeWidth={1.5} />}
            label="Emotional"
            value={fatigue.emotional}
            color="emotional"
          />
          <AnimatedFatigueBar
            icon={<Cpu size={13} strokeWidth={1.5} />}
            label="Intellectual"
            value={fatigue.intellectual}
            color="intellectual"
          />
        </div>
      </div>

      {/* Right: Settings — spans full panel height */}
      <Link
        href="/app/settings"
        style={{
          width: '90px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          color: 'rgba(255, 255, 255, 0.4)',
          textDecoration: 'none',
          transition: 'color 0.2s ease',
        }}
      >
        <Settings size={18} strokeWidth={1.5} />
        <span
          style={{
            fontSize: '0.625rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Settings
        </span>
      </Link>
    </aside>
  )
}

function AnimatedFatigueBar({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'physical' | 'emotional' | 'intellectual'
}) {
  const colorMap = {
    physical: '#00d4ff',
    emotional: '#ec4899',
    intellectual: '#a855f7',
  }
  const textColor = colorMap[color]
  const isHigh = value >= 91
  const isMedium = value >= 61 && value < 91

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={{ color: textColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {icon}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: '0.5625rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: textColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: '0.5625rem',
            fontFamily: 'Orbitron, monospace',
            color: value >= 91 ? textColor : 'rgba(255, 255, 255, 0.4)',
            flexShrink: 0,
          }}
        >
          {value}%
        </span>
        {isHigh && (
          <AlertTriangle
            size={10}
            strokeWidth={1.5}
            aria-label="High fatigue — task performance may suffer"
            style={{ color: textColor, flexShrink: 0 }}
          />
        )}
      </div>

      {/* Animated fatigue bar using Framer Motion spring */}
      <div
        style={{
          height: '0.1875rem',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: isHigh ? `0 0 6px ${textColor}` : undefined,
        }}
      >
        <motion.div
          animate={{ width: `${value}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            backgroundColor: textColor,
            opacity: isMedium ? 0.8 : 1,
          }}
        />
      </div>
    </div>
  )
}
