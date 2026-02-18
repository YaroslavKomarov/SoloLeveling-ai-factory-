'use client'

import { User, Settings, Dumbbell, Heart, Cpu, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Progress } from '@/components/ui/Progress'
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
  fatigue?: FatigueData
}

export function UserPanel({
  level = 1,
  xp = 0,
  xpToNext = 100,
  fatigue = { physical: 0, emotional: 0, intellectual: 0 },
}: UserPanelProps) {
  logger.debug('hydrated', { level, xp, fatigue })

  const anyFatigueHigh = fatigue.physical >= 91 || fatigue.emotional >= 91 || fatigue.intellectual >= 91

  return (
    <aside
      style={{
        position: 'fixed',
        top: 'var(--header-height)',
        right: 0,
        width: '220px',
        padding: '1rem',
        backgroundColor: 'rgba(15, 20, 25, 0.9)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Avatar + level */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 8px rgba(255, 255, 255, 0.15)',
          }}
        >
          <User size={16} strokeWidth={1.5} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.75rem',
                color: '#ffffff',
                textShadow: '0 0 6px rgba(255, 255, 255, 0.3)',
                letterSpacing: '0.05em',
              }}
            >
              LVL {level}
            </span>
            {anyFatigueHigh && (
              <AlertTriangle
                size={12}
                strokeWidth={1.5}
                style={{ color: '#ec4899', flexShrink: 0 }}
              />
            )}
          </div>
          <div
            style={{
              fontSize: '0.625rem',
              color: 'rgba(255, 255, 255, 0.5)',
              fontFamily: 'Cormorant, serif',
              letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {xp} / {xpToNext} XP
          </div>
        </div>
      </div>

      {/* XP progress bar */}
      <Progress value={xp} max={xpToNext} color="white" height="0.1875rem" />

      {/* Fatigue bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <FatigueBar icon={<Dumbbell size={12} strokeWidth={1.5} />} label="Physical" value={fatigue.physical} color="physical" />
        <FatigueBar icon={<Heart size={12} strokeWidth={1.5} />} label="Emotional" value={fatigue.emotional} color="emotional" />
        <FatigueBar icon={<Cpu size={12} strokeWidth={1.5} />} label="Intellectual" value={fatigue.intellectual} color="intellectual" />
      </div>

      {/* Settings link */}
      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem' }}>
        <Link
          href="/app/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            color: 'rgba(255, 255, 255, 0.4)',
            textDecoration: 'none',
            fontSize: '0.625rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            transition: 'color 0.2s ease',
          }}
        >
          <Settings size={12} strokeWidth={1.5} />
          Settings
        </Link>
      </div>
    </aside>
  )
}

function FatigueBar({
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={{ color: textColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span
          style={{
            flex: 1,
            fontSize: '0.5625rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: textColor,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: '0.5625rem',
            fontFamily: 'Orbitron, monospace',
            color: value >= 91 ? textColor : 'rgba(255, 255, 255, 0.4)',
          }}
        >
          {value}%
        </span>
      </div>
      <Progress value={value} max={100} color={color} height="0.1875rem" />
    </div>
  )
}
