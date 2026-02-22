'use client'

/**
 * WeeklyStatsCard — three weekly aggregate stats: XP earned, tasks completed, streak.
 */
import { motion } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { fadeInUp } from '@/lib/animations/variants'
import { useMotionSafe } from '@/lib/animations/useMotionSafe'

interface WeeklyStatsCardProps {
  xpEarned: number
  tasksCompleted: number
  streak: number
}

export function WeeklyStatsCard({ xpEarned, tasksCompleted, streak }: WeeklyStatsCardProps) {
  const variants = useMotionSafe(fadeInUp)

  return (
    <motion.div variants={variants} initial="hidden" animate="visible">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 0,
            }}
          >
            {[
              { value: xpEarned.toLocaleString(), label: 'XP This Week' },
              { value: String(tasksCompleted), label: 'Completed' },
              { value: String(streak), label: 'Day Streak' },
            ].map(({ value, label }, index, arr) => (
              <div
                key={label}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem 0.25rem',
                  borderRight:
                    index < arr.length - 1
                      ? '1px solid rgba(255,255,255,0.08)'
                      : 'none',
                }}
              >
                <div
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1,
                    marginBottom: '0.375rem',
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.5rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
