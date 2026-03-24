'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import type { TaskRow } from '@/lib/supabase/types'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { useTimerStore } from '@/store/timer'
import { fadeInUp, tapScale, cardHover } from '@/lib/animations/variants'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TaskCard')

interface TaskCardProps {
  task: TaskRow
  goalTitle: string
  regularStats?: { completed: number; total: number; skipped: number }
}

const REGULAR_FATIGUE_COST = 4
const STRATEGIC_FATIGUE_COST = 6
const FATIGUE_SOFT_LIMIT = 91

export function TaskCard({ task: initialTask, goalTitle, regularStats }: TaskCardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const updateTask = useTasksStore((s) => s.updateTask)
  const setLevelUpPending = useTasksStore((s) => s.setLevelUpPending)
  const todaysTasks = useTasksStore((s) => s.todaysTasks)
  const missedTasks = useTasksStore((s) => s.missedTasks)
  const incrementFatigue = useUserStore((s) => s.incrementFatigue)
  const setXp = useUserStore((s) => s.setXp)
  const userFatigue = useUserStore((s) => s.fatigue)

  const activeTaskId = useTimerStore((s) => s.activeTaskId)
  const startTask = useTimerStore((s) => s.startTask)

  // Use store task if available (for live updates), fall back to prop.
  // Missed tasks live in missedTasks store, not todaysTasks.
  const task =
    todaysTasks.find((t) => t.id === initialTask.id) ??
    missedTasks.find((t) => t.id === initialTask.id) ??
    initialTask
  const fatigueCost = task.task_type === 'strategic' ? STRATEGIC_FATIGUE_COST : REGULAR_FATIGUE_COST

  const fatigueType = task.fatigue_type

  const isActiveInTimer = activeTaskId === task.id
  const anotherTaskActive = activeTaskId !== null && activeTaskId !== task.id

  // Check if completing this task would breach the soft fatigue limit (only for the relevant bar)
  const wouldBreachFatigue = userFatigue[fatigueType] + fatigueCost >= FATIGUE_SOFT_LIMIT

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
    incrementFatigue(fatigueCost, fatigueType)
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

      // Revert optimistic update (restore original status, not always 'scheduled')
      updateTask(task.id, { status: initialTask.status })
      incrementFatigue(-fatigueCost, fatigueType)
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function onStartClick() {
    if (anotherTaskActive) {
      setErrorMsg('Another task is already in progress. Cancel it before starting a new one.')
      return
    }

    logger.debug('TaskCard.startTask', { taskId: task.id, taskType: task.task_type, durationMs: task.duration_minutes * 60000 })

    startTask({
      id: task.id,
      title: task.title,
      task_type: task.task_type,
      duration_minutes: task.duration_minutes ?? (task.task_type === 'strategic' ? 27 : 12),
      fatigue_type: task.fatigue_type,
    })

    if (task.task_type === 'strategic') {
      // Redirect to goal expert chat instead of opening dialog
      logger.debug('[TaskCard] strategic task start → redirect', { goalId: task.goal_id, taskId: task.id })
      router.push(
        `/app/goals/${task.goal_id}?tab=expert&newTaskSession=${task.id}&newTaskTitle=${encodeURIComponent(task.title)}`
      )
    }
  }

  return (
    <>
      <motion.div
        variants={fadeInUp}
        whileHover={isFinished ? undefined : cardHover}
        style={{
          position: 'relative',
          backgroundColor: isActiveInTimer ? 'rgba(15, 20, 25, 0.95)' : 'rgba(15, 20, 25, 0.85)',
          borderTop: `1px solid ${isActiveInTimer ? (task.task_type === 'strategic' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(0, 212, 255, 0.4)') : 'rgba(255, 255, 255, 0.1)'}`,
          borderRight: `1px solid ${isActiveInTimer ? (task.task_type === 'strategic' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(0, 212, 255, 0.4)') : 'rgba(255, 255, 255, 0.1)'}`,
          borderBottom: `1px solid ${isActiveInTimer ? (task.task_type === 'strategic' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(0, 212, 255, 0.4)') : 'rgba(255, 255, 255, 0.1)'}`,
          borderLeft: `3px solid ${isActiveInTimer ? (task.task_type === 'strategic' ? '#a855f7' : '#00d4ff') : accentColor}`,
          padding: '1rem 1.25rem',
          opacity: isFinished ? 0.6 : 1,
          transition: 'opacity 0.2s ease, border-color 0.2s ease',
          boxShadow: isActiveInTimer
            ? `0 0 16px ${task.task_type === 'strategic' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(0, 212, 255, 0.15)'}`
            : 'none',
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

        {/* In-progress badge */}
        {isActiveInTimer && (
          <div
            style={{
              position: 'absolute',
              top: '0.75rem',
              right: '0.75rem',
              padding: '0.2rem 0.5rem',
              backgroundColor: task.task_type === 'strategic' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(0, 212, 255, 0.1)',
              border: `1px solid ${task.task_type === 'strategic' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(0, 212, 255, 0.3)'}`,
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5625rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: task.task_type === 'strategic' ? '#a855f7' : '#00d4ff',
            }}
          >
            In Progress
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

        {/* Metadata row: XP badge + fatigue cost + duration */}
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
          {task.duration_minutes != null && (
            <span
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.625rem',
                color: 'rgba(255, 255, 255, 0.35)',
                letterSpacing: '0.05em',
              }}
            >
              {task.duration_minutes}min
            </span>
          )}
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
          {task.task_type === 'regular' && regularStats && (
            <span
              style={{
                padding: '0.2rem 0.5rem',
                backgroundColor: regularStats.skipped >= 2 ? 'rgba(236, 72, 153, 0.1)' : 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${regularStats.skipped >= 2 ? 'rgba(236, 72, 153, 0.3)' : 'rgba(255, 255, 255, 0.12)'}`,
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.625rem',
                color: regularStats.skipped >= 2 ? '#ec4899' : 'rgba(255, 255, 255, 0.5)',
                letterSpacing: '0.05em',
              }}
            >
              {regularStats.completed}/{regularStats.total}
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

        {/* At-risk warning — shown when exactly 2 skips/misses (next skip fails the goal) */}
        {task.task_type === 'regular' && regularStats?.skipped === 2 && !isFinished && (
          <div
            style={{
              marginBottom: '0.625rem',
              padding: '0.375rem 0.625rem',
              backgroundColor: 'rgba(236, 72, 153, 0.08)',
              border: '1px solid rgba(236, 72, 153, 0.2)',
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5625rem',
              letterSpacing: '0.08em',
              color: '#ec4899',
            }}
          >
            ⚠ СЛЕДУЮЩИЙ ПРОПУСК ЗАВЕРШИТ ЦЕЛЬ
          </div>
        )}

        {/* Action buttons */}
        {!isFinished && !isActiveInTimer && (
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <motion.button
              onClick={onStartClick}
              disabled={isLoading}
              whileTap={isLoading ? undefined : tapScale}
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
              Start
            </motion.button>

          </div>
        )}

      </motion.div>

    </>
  )
}
