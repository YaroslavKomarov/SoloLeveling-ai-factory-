'use client'

import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

interface GoalAtRiskBannerProps {
  goalTitle: string
  unscheduledCount?: number
}

export function GoalAtRiskBanner({ goalTitle, unscheduledCount }: GoalAtRiskBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        marginBottom: '1rem',
        padding: '0.875rem 1rem',
        backgroundColor: 'rgba(10, 12, 16, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
      }}
    >
      <AlertTriangle
        size={16}
        style={{ color: 'rgba(255, 255, 255, 0.6)', flexShrink: 0, marginTop: '2px' }}
      />
      <div>
        <p
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.6875rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.9)',
            marginBottom: '0.25rem',
          }}
        >
          Goal at Risk — {goalTitle}
        </p>
        <p
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.5)',
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          {unscheduledCount !== undefined && unscheduledCount > 0
            ? `${unscheduledCount} strategic task${unscheduledCount === 1 ? '' : 's'} could not be scheduled before the deadline. `
            : ''}
          Some strategic tasks could not be scheduled before the deadline. You can still achieve this goal by completing tasks ahead of schedule.
        </p>
      </div>
    </motion.div>
  )
}
