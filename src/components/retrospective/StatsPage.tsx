'use client'

import { useEffect } from 'react'
import { createLogger } from '@/lib/logger'
import type { WeekStats } from '@/lib/services/retrospective-stats'

const logger = createLogger('StatsPage')

interface Props {
  stats: WeekStats
  onNext: () => void
}

export function StatsPage({ stats, onNext }: Props) {
  useEffect(() => {
    logger.debug('StatsPage mounted', { weekStart: stats.weekStart, weekEnd: stats.weekEnd })
  }, [stats.weekStart, stats.weekEnd])

  const totalTasks = stats.tasksCompleted + stats.tasksSkipped + stats.tasksMissed
  const completionRate = totalTasks > 0 ? Math.round((stats.tasksCompleted / totalTasks) * 100) : 0

  // Compute max fatigue for bar scaling
  const maxFatigue = Math.max(
    ...stats.fatigueByDay.map((f) => Math.max(f.physical, f.emotional, f.intellectual)),
    1
  )

  function handleNext() {
    logger.debug('StatsPage: Continue clicked')
    onNext()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Week range */}
      <div style={{ textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.1em',
          }}
        >
          {stats.weekStart} — {stats.weekEnd}
        </span>
      </div>

      {/* Key metrics grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
        }}
      >
        <MetricCard label="Completed" value={stats.tasksCompleted} highlight />
        <MetricCard label="Skipped" value={stats.tasksSkipped} />
        <MetricCard label="Missed" value={stats.tasksMissed} />
        <MetricCard label="XP Earned" value={stats.xpEarned} suffix="xp" highlight />
        <MetricCard label="Streak" value={stats.streakDays} suffix="days" />
        <MetricCard label="Rate" value={completionRate} suffix="%" highlight={completionRate >= 70} />
      </div>

      {/* Fatigue chart */}
      {stats.fatigueByDay.length > 0 && (
        <div>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5625rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              display: 'block',
              marginBottom: '0.75rem',
            }}
          >
            Fatigue by Day
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '64px' }}>
            {stats.fatigueByDay.map((f) => {
              const avg = Math.round((f.physical + f.emotional + f.intellectual) / 3)
              const barHeight = Math.round((avg / maxFatigue) * 64)
              const day = new Date(f.date + 'T00:00:00Z').toLocaleDateString('en', { weekday: 'short' })

              return (
                <div
                  key={f.date}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                >
                  <div
                    title={`${f.date}: avg ${avg}%`}
                    style={{
                      width: '100%',
                      height: `${barHeight}px`,
                      backgroundColor: avg >= 70 ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.25)',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '0.5rem',
                      color: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Goal stats summary */}
      {stats.goalStats.length > 0 && (
        <div>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5625rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              display: 'block',
              marginBottom: '0.75rem',
            }}
          >
            Goals
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {stats.goalStats.map((gs) => (
              <div
                key={gs.goalId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Cormorant, serif',
                    fontSize: '0.9375rem',
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  {gs.goalTitle}
                </span>
                <span
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.6875rem',
                    color: gs.completionRate >= 0.7 ? 'rgba(255,255,255,0.8)' : 'rgba(255,100,100,0.7)',
                  }}
                >
                  {Math.round(gs.completionRate * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={handleNext}
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.6875rem',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: '#ffffff',
          backgroundColor: 'transparent',
          border: '1px solid rgba(255,255,255,0.3)',
          padding: '0.875rem 2rem',
          cursor: 'pointer',
          alignSelf: 'flex-end',
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
        }}
      >
        Continue
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper component
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string
  value: number
  suffix?: string
  highlight?: boolean
}) {
  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: highlight ? '#ffffff' : 'rgba(255,255,255,0.55)',
          lineHeight: 1,
          marginBottom: '0.375rem',
        }}
      >
        {value}
        {suffix && (
          <span style={{ fontSize: '0.75rem', marginLeft: '2px', color: 'rgba(255,255,255,0.3)' }}>
            {suffix}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.4375rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
