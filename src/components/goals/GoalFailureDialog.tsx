'use client'

import { useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { GoalRow } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GoalFailureDialog')

const FAILURE_MESSAGES: Record<string, string> = {
  consecutive_skips: 'Three consecutive sessions were missed without completion.',
  skip_rate: 'The overall task skip rate exceeded 20% for this goal.',
}

interface GoalFailureDialogProps {
  goal: GoalRow
  onAcknowledge: () => void
  onCreateNewGoal: (goalId: string) => void
}

export function GoalFailureDialog({ goal, onAcknowledge, onCreateNewGoal }: GoalFailureDialogProps) {
  // POST acknowledgment on mount
  useEffect(() => {
    logger.debug('GoalFailureDialog mounted — posting acknowledgment', { goalId: goal.id })

    fetch(`/api/goals/${goal.id}/acknowledge-failure`, { method: 'POST' })
      .then((res) => {
        if (!res.ok && res.status !== 409) {
          logger.warn('Acknowledge-failure request failed', { goalId: goal.id, status: res.status })
        } else {
          logger.info('Goal failure acknowledgment posted', { goalId: goal.id })
        }
      })
      .catch((err) => {
        logger.error('Acknowledge-failure fetch error', { goalId: goal.id, error: err?.message })
      })
  }, [goal.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateNewGoal = useCallback(() => {
    logger.debug('User chose to create new goal from failure', { goalId: goal.id })
    onCreateNewGoal(goal.id)
    onAcknowledge()
  }, [goal.id, onCreateNewGoal, onAcknowledge])

  const handleDismiss = useCallback(() => {
    logger.debug('User dismissed failure dialog', { goalId: goal.id })
    onAcknowledge()
  }, [goal.id, onAcknowledge])

  const failureMessage = goal.failure_reason
    ? (FAILURE_MESSAGES[goal.failure_reason] ?? goal.failure_reason)
    : 'This goal has been marked as failed.'

  return (
    <motion.div
      key="goal-failure-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(10, 12, 16, 0.97)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 28, delay: 0.05 }}
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'rgba(12, 14, 18, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '2.5rem 2rem',
        }}
      >
        {/* Heading */}
        <p
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '1.25rem',
            fontWeight: 700,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#ffffff',
            marginBottom: '0.5rem',
          }}
        >
          Goal Failed
        </p>

        {/* Goal title */}
        <p
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '1.0625rem',
            color: 'rgba(255, 255, 255, 0.7)',
            fontStyle: 'italic',
            marginBottom: '1.25rem',
          }}
        >
          {goal.title}
        </p>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            marginBottom: '1.25rem',
          }}
        />

        {/* Failure reason */}
        <p
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '0.9375rem',
            color: 'rgba(255, 255, 255, 0.55)',
            lineHeight: 1.6,
            marginBottom: '1rem',
          }}
        >
          {failureMessage}
        </p>

        {/* Preservation note */}
        <p
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '0.8125rem',
            color: 'rgba(255, 255, 255, 0.35)',
            fontStyle: 'italic',
            marginBottom: '2rem',
            lineHeight: 1.5,
          }}
        >
          Strategic task progress and notes are preserved. Regular task progress has been reset.
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Primary: Create New Goal */}
          <button
            onClick={handleCreateNewGoal}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              fontFamily: 'Cinzel, serif',
              fontSize: '0.6875rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Create New Goal
          </button>

          {/* Secondary: Dismiss */}
          <button
            onClick={handleDismiss}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.4)',
              fontFamily: 'Cinzel, serif',
              fontSize: '0.6875rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
