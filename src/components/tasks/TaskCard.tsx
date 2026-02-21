'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { TaskRow } from '@/lib/supabase/types'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { StrategicExecutionDialog } from '@/components/tasks/StrategicExecutionDialog'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TaskCard')

interface TaskCardProps {
  task: TaskRow
  goalTitle: string
}

const REGULAR_FATIGUE_COST = 4
const STRATEGIC_FATIGUE_COST = 6
const FATIGUE_SOFT_LIMIT = 91

export function TaskCard({ task: initialTask, goalTitle }: TaskCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const updateTask = useTasksStore((s) => s.updateTask)
  const setLevelUpPending = useTasksStore((s) => s.setLevelUpPending)
  const todaysTasks = useTasksStore((s) => s.todaysTasks)
  const incrementFatigue = useUserStore((s) => s.incrementFatigue)
  const setXp = useUserStore((s) => s.setXp)
  const userFatigue = useUserStore((s) => s.fatigue)

  // Use store task if available (for live updates), fall back to prop
  const task = todaysTasks.find((t) => t.id === initialTask.id) ?? initialTask
  const fatigueCost = task.task_type === 'strategic' ? STRATEGIC_FATIGUE_COST : REGULAR_FATIGUE_COST

  // Check if completing this task would breach the soft fatigue limit
  const wouldBreachFatigue =
    userFatigue.physical + fatigueCost >= FATIGUE_SOFT_LIMIT ||
    userFatigue.emotional + fatigueCost >= FATIGUE_SOFT_LIMIT ||
    userFatigue.intellectual + fatigueCost >= FATIGUE_SOFT_LIMIT

  const isCompleted = task.status === 'completed'
  const isSkipped = task.status === 'skipped'
  const isFinished = isCompleted || isSkipped

  const accentColor =
    task.task_type === 'strategic' ? '#a855f7' : 'rgba(255, 255, 255, 0.5)'

  async function handleComplete(note?: string) {
    if (isLoading || isFinished) return

    logger.debug(`complete task ${task.id} (type=${task.task_type})`, { hasNote: !!note })

    // Optimistic update
    updateTask(task.id, { status: 'completed' })
    incrementFatigue(fatigueCost)
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      logger.debug(`Complete response: xpGained=${data.xpGained}, didLevelUp=${data.didLevelUp}`)

      // Sync server state
      updateTask(task.id, data.task)
      setXp(data.newXp, data.newLevel)

      if (data.didLevelUp) {
        setLevelUpPending(data.newLevel, data.previousLevel)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Complete task failed, reverting optimistic update`, { taskId: task.id, error: msg })

      // Revert optimistic update
      updateTask(task.id, { status: 'scheduled' })
      incrementFatigue(-fatigueCost)
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSkip() {
    if (isLoading || isFinished) return

    logger.debug(`skip task ${task.id} (type=${task.task_type})`)

    // Optimistic update
    updateTask(task.id, { status: 'skipped' })
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/tasks/${task.id}/skip`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      updateTask(task.id, data.task)

      if (data.goalFailed) {
        logger.warn(`Goal failed after skip`, { taskId: task.id, reason: data.failureReason })
        // GoalFailedBanner could be added here — showing error message for now
        setErrorMsg(`Goal failed: ${data.failureReason === 'consecutive_skips' ? '3 consecutive skips' : 'Skip rate exceeded 20%'}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Skip task failed, reverting optimistic update`, { taskId: task.id, error: msg })

      // Revert optimistic update
      updateTask(task.id, { status: 'scheduled' })
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function onCompleteClick() {
    if (task.task_type === 'strategic') {
      setIsDialogOpen(true)
    } else {
      handleComplete()
    }
  }

  return (
    <>
      <div
        style={{
          position: 'relative',
          backgroundColor: 'rgba(15, 20, 25, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderLeft: `3px solid ${accentColor}`,
          padding: '1rem 1.25rem',
          opacity: isFinished ? 0.6 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {/* Status badge */}
        {isFinished && (
          <div
            style={{
              position: 'absolute',
              top: '0.75rem',
              right: '0.75rem',
              padding: '0.2rem 0.5rem',
              backgroundColor: isCompleted ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${isCompleted ? 'rgba(0, 212, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)'}`,
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5625rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: isCompleted ? '#00d4ff' : 'rgba(255, 255, 255, 0.4)',
            }}
          >
            {isCompleted ? 'Completed' : 'Skipped'}
          </div>
        )}

        {/* Task title */}
        <div style={{ marginBottom: '0.25rem' }}>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#ffffff',
              letterSpacing: '0.04em',
            }}
          >
            {task.title}
          </span>
        </div>

        {/* Goal name */}
        <div style={{ marginBottom: '0.875rem' }}>
          <span
            style={{
              fontFamily: 'Cormorant, serif',
              fontSize: '0.8125rem',
              fontStyle: 'italic',
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            {goalTitle}
          </span>
        </div>

        {/* Metadata row: XP badge + fatigue cost */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
          <span
            style={{
              padding: '0.2rem 0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.625rem',
              color: 'rgba(255, 255, 255, 0.6)',
              letterSpacing: '0.05em',
            }}
          >
            +{task.xp_reward} XP
          </span>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.625rem',
              color: task.task_type === 'strategic' ? '#a855f7' : '#00d4ff',
              letterSpacing: '0.05em',
            }}
          >
            -{fatigueCost}% fatigue
          </span>
          {task.task_type === 'strategic' && (
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#a855f7',
              }}
            >
              Strategic
            </span>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div
            style={{
              marginBottom: '0.75rem',
              padding: '0.4rem 0.625rem',
              backgroundColor: 'rgba(236, 72, 153, 0.1)',
              border: '1px solid rgba(236, 72, 153, 0.25)',
              fontFamily: 'Cormorant, serif',
              fontSize: '0.8125rem',
              color: '#ec4899',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Action buttons */}
        {!isFinished && (
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button
              onClick={onCompleteClick}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              {wouldBreachFatigue && (
                <AlertTriangle
                  size={12}
                  strokeWidth={1.5}
                  style={{ color: '#ec4899', flexShrink: 0 }}
                />
              )}
              Complete
            </button>

            <button
              onClick={handleSkip}
              disabled={isLoading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'rgba(255, 255, 255, 0.4)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'border-color 0.2s ease',
              }}
            >
              Skip
            </button>
          </div>
        )}
      </div>

      {/* Strategic execution dialog */}
      {isDialogOpen && (
        <StrategicExecutionDialog
          task={task}
          onComplete={(note) => {
            setIsDialogOpen(false)
            handleComplete(note)
          }}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </>
  )
}
