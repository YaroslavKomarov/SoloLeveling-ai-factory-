'use client'

import { Settings, Dumbbell, Heart, Cpu, AlertTriangle } from 'lucide-react'
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

// Corner bracket decorations for RPG-style frame
function CornerBrackets({
  size = 12,
  color = 'rgba(255, 255, 255, 0.5)',
}: {
  size?: number
  color?: string
}) {
  const corners = [
    { top: -1, left: -1, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
    { top: -1, right: -1, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` },
    { bottom: -1, left: -1, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
    { bottom: -1, right: -1, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` },
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
  level = 1,
  xp = 0,
  xpToNext = 100,
  fatigue = { physical: 0, emotional: 0, intellectual: 0 },
}: UserPanelProps) {
  logger.debug('rendered', { level, fatigue })

  const anyFatigueHigh = fatigue.physical >= 91 || fatigue.emotional >= 91 || fatigue.intellectual >= 91

  return (
    <aside
      style={{
        position: 'fixed',
        top: 'var(--header-height)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '65%',
        height: 'var(--user-panel-height)',
        padding: '0.625rem 1.25rem',
        backgroundColor: 'rgba(15, 20, 25, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.7), 0 0 12px rgba(255, 255, 255, 0.06), inset 0 0 8px rgba(255, 255, 255, 0.03)',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Panel corner brackets */}
      <CornerBrackets size={14} color="rgba(255, 255, 255, 0.45)" />

      {/* Row 1: Level avatar + level text + XP bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>

        {/* Level avatar square */}
        <div
          style={{
            position: 'relative',
            width: '36px',
            height: '36px',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CornerBrackets size={7} color="rgba(255, 255, 255, 0.55)" />
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '1rem',
              fontWeight: 500,
              color: '#ffffff',
              textShadow: '0 0 8px rgba(255, 255, 255, 0.4)',
              letterSpacing: 0,
            }}
          >
            {level}
          </span>
        </div>

        {/* Level label + XP text */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flexShrink: 0 }}>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            Level
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.875rem',
                fontWeight: 400,
                letterSpacing: '0.05em',
                color: '#ffffff',
                textShadow: '0 0 6px rgba(255, 255, 255, 0.25)',
              }}
            >
              Level {level}
            </span>
            {anyFatigueHigh && (
              <AlertTriangle size={11} strokeWidth={1.5} style={{ color: '#ec4899', flexShrink: 0 }} />
            )}
          </div>
        </div>

        {/* XP progress bar — fills remaining space */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <Progress value={xp} max={xpToNext} color="white" height="0.1875rem" />
        </div>

        {/* XP numbers */}
        <span
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.5625rem',
            color: 'rgba(255, 255, 255, 0.45)',
            flexShrink: 0,
            letterSpacing: '0.03em',
          }}
        >
          {xp} / {xpToNext}
        </span>
      </div>

      {/* Row 2: Fatigue bars + Settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <HorizontalFatigueBar
          icon={<Dumbbell size={11} strokeWidth={1.5} />}
          label="Physical"
          value={fatigue.physical}
          color="physical"
        />
        <HorizontalFatigueBar
          icon={<Heart size={11} strokeWidth={1.5} />}
          label="Emotional"
          value={fatigue.emotional}
          color="emotional"
        />
        <HorizontalFatigueBar
          icon={<Cpu size={11} strokeWidth={1.5} />}
          label="Intellectual"
          value={fatigue.intellectual}
          color="intellectual"
        />

        {/* Settings link */}
        <Link
          href="/app/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            color: 'rgba(255, 255, 255, 0.35)',
            textDecoration: 'none',
            fontSize: '0.5rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            flexShrink: 0,
            transition: 'color 0.2s ease',
          }}
        >
          <Settings size={11} strokeWidth={1.5} />
          Settings
        </Link>
      </div>
    </aside>
  )
}

function HorizontalFatigueBar({
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ color: textColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            flex: 1,
            fontSize: '0.5rem',
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
            fontSize: '0.5rem',
            fontFamily: 'Orbitron, monospace',
            color: value >= 91 ? textColor : 'rgba(255, 255, 255, 0.4)',
            flexShrink: 0,
          }}
        >
          {value}%
        </span>
      </div>
      <Progress value={value} max={100} color={color} height="0.125rem" />
    </div>
  )
}
