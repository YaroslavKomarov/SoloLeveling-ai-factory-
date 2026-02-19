'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import type { GoalRow, QuestRow } from '@/lib/supabase/types'

interface GoalCardProps {
  goal: GoalRow
  quests: QuestRow[]
  onClick: () => void
}

function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((end - now) / 86_400_000))
}

const STATUS_BADGE: Record<GoalRow['status'], { label: string; variant: 'default' | 'connected' | 'error' }> = {
  active:    { label: 'Active',     variant: 'default' },
  completed: { label: 'Completed',  variant: 'connected' },
  failed:    { label: 'Failed',     variant: 'error' },
  cancelled: { label: 'Cancelled',  variant: 'error' },
}

const TYPE_COLOR: Record<GoalRow['goal_type'], string> = {
  skill:     'rgba(0, 212, 255, 0.6)',
  knowledge: 'rgba(168, 85, 247, 0.6)',
}

export function GoalCard({ goal, quests, onClick }: GoalCardProps) {
  const daysLeft = getDaysRemaining(goal.end_date)
  const { label: statusLabel, variant: statusVariant } = STATUS_BADGE[goal.status]

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ scale: 1.01 }}
      style={{
        padding: '1rem 1.25rem',
        backgroundColor: 'rgba(26, 31, 46, 0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderLeft: `3px solid ${TYPE_COLOR[goal.goal_type]}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h3
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.9375rem',
            fontWeight: 400,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#ffffff',
            margin: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          {goal.title}
        </h3>
        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0, alignItems: 'center' }}>
          <Badge
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.65rem',
              letterSpacing: '0.06em',
              borderColor: TYPE_COLOR[goal.goal_type],
              color: goal.goal_type === 'skill' ? '#00d4ff' : '#a855f7',
              backgroundColor: 'transparent',
            }}
          >
            {goal.goal_type.toUpperCase()}
          </Badge>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </div>

      {/* Quest progress bars */}
      {quests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {quests.map((quest) => (
            <div key={quest.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: 'Cormorant, Georgia, serif',
                    fontSize: '0.8125rem',
                    color: 'rgba(255,255,255,0.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {quest.title}
                </span>
                <span
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                    flexShrink: 0,
                    marginLeft: '0.5rem',
                  }}
                >
                  {quest.current_value}/{quest.target_value}
                </span>
              </div>
              <Progress value={quest.current_value} max={quest.target_value} height="2px" color="white" />
            </div>
          ))}
        </div>
      )}

      {/* Footer: days remaining */}
      {goal.status === 'active' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.75rem',
              color: daysLeft <= 14 ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.4)',
            }}
          >
            {daysLeft}d left
          </span>
        </div>
      )}
    </motion.div>
  )
}
