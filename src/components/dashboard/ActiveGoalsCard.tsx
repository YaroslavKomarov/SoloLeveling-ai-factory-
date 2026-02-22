'use client'

/**
 * ActiveGoalsCard — lists active goals with per-goal weekly completion stats.
 */
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { staggerContainerFast, fadeInUp } from '@/lib/animations/variants'
import { useMotionSafe } from '@/lib/animations/useMotionSafe'
import type { GoalDashboardStat } from '@/lib/services/dashboard-stats'

interface ActiveGoalsCardProps {
  goalStats: GoalDashboardStat[]
}

export function ActiveGoalsCard({ goalStats }: ActiveGoalsCardProps) {
  const containerVariants = useMotionSafe(staggerContainerFast)
  const itemVariants = useMotionSafe(fadeInUp)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Goals</CardTitle>
      </CardHeader>
      <CardContent>
        {goalStats.length === 0 ? (
          <p
            style={{
              fontFamily: 'Cormorant, Georgia, serif',
              fontSize: '0.9375rem',
              color: 'rgba(255,255,255,0.4)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No active goals. Visit Spheres to create your first 90-day goal.
          </p>
        ) : (
          <motion.ul
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {goalStats.map((goal, index) => (
              <motion.li
                key={goal.goalId}
                variants={itemVariants}
                style={{
                  paddingBottom: index < goalStats.length - 1 ? '1rem' : 0,
                  marginBottom: index < goalStats.length - 1 ? '1rem' : 0,
                  borderBottom:
                    index < goalStats.length - 1
                      ? '1px solid rgba(255,255,255,0.06)'
                      : 'none',
                }}
              >
                {/* Goal header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginBottom: '0.25rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontFamily: 'Cinzel, serif',
                        fontSize: '0.875rem',
                        letterSpacing: '0.06em',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {goal.goalTitle}
                    </span>
                    {goal.isAtRisk && (
                      <span
                        style={{
                          fontFamily: 'Cinzel, serif',
                          fontSize: '0.5625rem',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: '#ec4899',
                          flexShrink: 0,
                        }}
                      >
                        At Risk
                      </span>
                    )}
                  </div>

                  {/* Days remaining */}
                  <span
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '0.6875rem',
                      color:
                        goal.daysRemaining <= 14
                          ? '#ef4444'
                          : 'rgba(255,255,255,0.35)',
                      flexShrink: 0,
                    }}
                  >
                    {goal.daysRemaining}d
                  </span>
                </div>

                {/* Sphere name */}
                <p
                  style={{
                    fontFamily: 'Cormorant, Georgia, serif',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.4)',
                    margin: '0 0 0.5rem',
                  }}
                >
                  {goal.sphereName}
                </p>

                {/* Weekly completion bar */}
                <Progress
                  value={goal.weeklyCompletionRate * 100}
                  color="white"
                  height="2px"
                />

                {/* Weekly count */}
                <p
                  style={{
                    fontFamily: 'Cormorant, Georgia, serif',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.35)',
                    margin: '0.3rem 0 0',
                  }}
                >
                  {goal.weeklyCompleted}/{goal.weeklyTotal} tasks this week
                </p>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </CardContent>
    </Card>
  )
}
