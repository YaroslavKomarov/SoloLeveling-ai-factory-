'use client'

import { useEffect, useState } from 'react'
import { useTimerStore } from '@/store/timer'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { ActiveTaskBanner } from '@/components/tasks/ActiveTaskBanner'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TimerProvider')

export function TimerProvider() {
  const restoreFromStorage = useTimerStore((s) => s.restoreFromStorage)
  const activeTaskId = useTimerStore((s) => s.activeTaskId)
  const completeTask = useTimerStore((s) => s.completeTask)

  const updateTask = useTasksStore((s) => s.updateTask)
  const setLevelUpPending = useTasksStore((s) => s.setLevelUpPending)
  const setXp = useUserStore((s) => s.setXp)
  const incrementFatigue = useUserStore((s) => s.incrementFatigue)

  const [autoCompletedToast, setAutoCompletedToast] = useState<string | null>(null)

  useEffect(() => {
    const stored = restoreFromStorage()

    if (!stored) {
      logger.debug('TimerProvider mount', { hasActiveTask: false })
      return
    }

    const elapsed = Date.now() - stored.startedAt
    const wasExpired = elapsed >= stored.durationMs

    logger.debug('TimerProvider mount', {
      hasActiveTask: true,
      taskId: stored.taskId,
      wasExpired,
      elapsed,
      durationMs: stored.durationMs,
    })

    if (wasExpired) {
      // T15: auto-complete task that expired while app was closed
      autoCompleteExpiredTask(stored.taskId, stored.taskType, stored.taskFatigueType, elapsed, stored.durationMs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function autoCompleteExpiredTask(
    taskId: string,
    taskType: 'regular' | 'strategic',
    fatigueType: 'physical' | 'emotional' | 'intellectual',
    elapsedMs: number,
    durationMs: number
  ) {
    logger.info('timer.autoComplete', { taskId, elapsedMs, durationMs })

    const FATIGUE_COST = taskType === 'strategic' ? 6 : 4

    try {
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      updateTask(taskId, data.task)
      setXp(data.newXp, data.newLevel)
      incrementFatigue(FATIGUE_COST, fatigueType)

      if (data.didLevelUp) {
        setLevelUpPending(data.newLevel, data.previousLevel)
      }

      completeTask()
      setAutoCompletedToast('Task completed automatically while you were away.')
      setTimeout(() => setAutoCompletedToast(null), 4000)
    } catch (err) {
      logger.error('timer.autoComplete failed', {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Clear the timer state even on failure to avoid broken state
      completeTask()
    }
  }

  return (
    <>
      <ActiveTaskBanner />
      {autoCompletedToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            padding: '0.625rem 1.25rem',
            backgroundColor: 'rgba(10, 12, 16, 0.95)',
            border: '1px solid rgba(0, 212, 255, 0.4)',
            fontFamily: 'Cormorant, serif',
            fontSize: '0.875rem',
            color: '#00d4ff',
            boxShadow: '0 4px 16px rgba(0, 212, 255, 0.15)',
            whiteSpace: 'nowrap',
          }}
        >
          {autoCompletedToast}
        </div>
      )}
    </>
  )
}
