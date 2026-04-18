'use client'

/**
 * TodayMissionCard — shows today's task summary, next task, and fatigue snapshot.
 */
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { fadeInUp } from '@/lib/animations/variants'
import { useMotionSafe } from '@/lib/animations/useMotionSafe'
import { useIsMobile } from '@/hooks/useIsMobile'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TodayMissionCard')

interface TodayMissionCardProps {
  totalTasks: number
  completedTasks: number
  skippedTasks: number
  nextTask: { id: string; title: string; xpReward: number } | null
  fatigue: { physical: number; emotional: number; intellectual: number }
}

export function TodayMissionCard({
  totalTasks,
  completedTasks,
  skippedTasks,
  nextTask,
  fatigue,
}: TodayMissionCardProps) {
  const variants = useMotionSafe(fadeInUp)
  const isMobile = useIsMobile()
  const allComplete = totalTasks > 0 && completedTasks === totalTasks
  logger.debug('rendering stats grid', { columnCount: isMobile ? 1 : 3 })

  return (
    <motion.div variants={variants} initial="hidden" animate="visible">
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Mission</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Task stat chips */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.25rem',
            }}
          >
            {[
              { label: 'Total', value: totalTasks },
              { label: 'Done', value: completedTasks },
              { label: 'Skipped', value: skippedTasks },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '1.5rem',
                    color: '#ffffff',
                    lineHeight: 1,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.5625rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.4)',
                    marginTop: '0.25rem',
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Next task or status message */}
          <div style={{ marginBottom: '1.25rem' }}>
            {nextTask ? (
              <Link
                href="/app/today"
                style={{ display: 'block', textDecoration: 'none' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.5rem',
                    padding: '0.625rem 0.75rem',
                    border: '1px solid rgba(255,255,255,0.12)',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.25)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.12)'
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '0.5625rem',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.4)',
                      flexShrink: 0,
                    }}
                  >
                    Next:
                  </span>
                  <span
                    style={{
                      fontFamily: 'Cormorant, Georgia, serif',
                      fontSize: '0.9375rem',
                      color: '#ffffff',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {nextTask.title}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '0.6875rem',
                      color: 'rgba(255,255,255,0.35)',
                      flexShrink: 0,
                    }}
                  >
                    +{nextTask.xpReward} XP
                  </span>
                </div>
              </Link>
            ) : allComplete ? (
              <p
                style={{
                  fontFamily: 'Cormorant, Georgia, serif',
                  fontSize: '0.9375rem',
                  color: 'rgba(255,255,255,0.5)',
                  fontStyle: 'italic',
                  margin: 0,
                  padding: '0.625rem 0',
                }}
              >
                All tasks complete for today.
              </p>
            ) : (
              <Link
                href="/app/today"
                style={{ textDecoration: 'none' }}
              >
                <p
                  style={{
                    fontFamily: 'Cormorant, Georgia, serif',
                    fontSize: '0.9375rem',
                    color: 'rgba(255,255,255,0.4)',
                    fontStyle: 'italic',
                    margin: 0,
                    padding: '0.625rem 0',
                  }}
                >
                  No tasks scheduled — visit Today to begin.
                </p>
              </Link>
            )}
          </div>

          {/* Fatigue snapshot */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: '1rem',
            }}
          >
            <p
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                margin: '0 0 0.625rem',
              }}
            >
              Fatigue
            </p>
            {(
              [
                { label: 'Physical', color: 'physical', value: fatigue.physical },
                { label: 'Emotional', color: 'emotional', value: fatigue.emotional },
                { label: 'Intellectual', color: 'intellectual', value: fatigue.intellectual },
              ] as const
            ).map(({ label, color, value }) => (
              <div key={label} style={{ marginBottom: '0.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '0.5625rem',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '0.625rem',
                      color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {Math.round(value)}%
                  </span>
                </div>
                <Progress value={value} color={color} height="0.25rem" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
