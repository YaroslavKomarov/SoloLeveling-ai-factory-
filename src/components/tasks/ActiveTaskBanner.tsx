'use client'

import { useEffect, useState, useRef } from 'react'
import { useTimerStore } from '@/store/timer'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ActiveTaskBanner')

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function ActiveTaskBanner() {
  const activeTaskId = useTimerStore((s) => s.activeTaskId)
  const taskTitle = useTimerStore((s) => s.taskTitle)
  const taskType = useTimerStore((s) => s.taskType)
  const taskFatigueType = useTimerStore((s) => s.taskFatigueType)
  const getRemainingMs = useTimerStore((s) => s.getRemainingMs)
  const completeTask = useTimerStore((s) => s.completeTask)
  const cancelTask = useTimerStore((s) => s.cancelTask)

  const updateTask = useTasksStore((s) => s.updateTask)
  const setLevelUpPending = useTasksStore((s) => s.setLevelUpPending)
  const setXp = useUserStore((s) => s.setXp)
  const incrementFatigue = useUserStore((s) => s.incrementFatigue)

  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const autoCompleteRef = useRef(false)

  useEffect(() => {
    if (!activeTaskId) {
      setRemainingMs(null)
      setIsCompleting(false)
      autoCompleteRef.current = false
      return
    }

    const initial = getRemainingMs()
    setRemainingMs(initial)
    logger.debug('ActiveTaskBanner mounted', { taskId: activeTaskId, remainingMs: initial })

    const interval = setInterval(() => {
      const remaining = getRemainingMs()
      setRemainingMs(remaining)

      if (remaining !== null && remaining <= 0 && !autoCompleteRef.current) {
        autoCompleteRef.current = true
        handleAutoComplete()
      }
    }, 1000)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId])

  async function handleAutoComplete() {
    if (!activeTaskId) return

    setIsCompleting(true)
    logger.info('ActiveTaskBanner auto-complete', { taskId: activeTaskId })

    const FATIGUE_COST = taskType === 'strategic' ? 6 : 4

    try {
      const res = await fetch(`/api/tasks/${activeTaskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      updateTask(activeTaskId, data.task)
      setXp(data.newXp, data.newLevel)

      if (taskFatigueType) {
        incrementFatigue(FATIGUE_COST, taskFatigueType)
      }

      if (data.didLevelUp) {
        setLevelUpPending(data.newLevel, data.previousLevel)
      }

      completeTask()
    } catch (err) {
      logger.error('ActiveTaskBanner auto-complete failed', {
        taskId: activeTaskId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Don't clear timer on failure — let user retry or cancel manually
      setIsCompleting(false)
      autoCompleteRef.current = false
    }
  }

  function handleCancel() {
    logger.debug('ActiveTaskBanner cancelled', { taskId: activeTaskId })
    cancelTask()
    setRemainingMs(null)
    setIsCompleting(false)
    autoCompleteRef.current = false
  }

  if (!activeTaskId) return null

  const accentColor = taskType === 'strategic' ? '#a855f7' : '#00d4ff'
  const accentBg = taskType === 'strategic' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(0, 212, 255, 0.06)'

  return (
    <div
      style={{
        position: 'fixed',
        top: 'var(--header-height)',
        left: 0,
        right: 0,
        zIndex: 30,
        backgroundColor: '#0a0c10',
        borderBottom: `1px solid ${accentColor}`,
        backgroundImage: `linear-gradient(135deg, ${accentBg} 0%, transparent 60%)`,
        padding: '0.5rem 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: `0 4px 16px ${accentColor}20`,
      }}
    >
      {/* Task type indicator */}
      <span
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.5rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: accentColor,
          opacity: 0.8,
          whiteSpace: 'nowrap',
        }}
      >
        {taskType === 'strategic' ? 'Strategic' : 'Task'}
      </span>

      {/* Task title */}
      <span
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.75rem',
          color: '#ffffff',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}
      >
        {taskTitle}
      </span>

      {/* Timer display */}
      <span
        style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: '1rem',
          color: isCompleting ? 'rgba(255, 255, 255, 0.5)' : accentColor,
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          minWidth: '5rem',
          textAlign: 'right',
        }}
      >
        {isCompleting
          ? 'Completing...'
          : remainingMs !== null
          ? formatTime(remainingMs)
          : '--:--'}
      </span>

      {/* Cancel button */}
      {!isCompleting && (
        <button
          onClick={handleCancel}
          style={{
            background: 'none',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.4)',
            fontFamily: 'Cinzel, serif',
            fontSize: '0.5625rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '0.3rem 0.75rem',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease, color 0.2s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.5)'
            e.currentTarget.style.color = '#ec4899'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'
          }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}
