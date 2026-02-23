import { create } from 'zustand'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TimerStore')

const STORAGE_KEY = 'sl_active_task'

export interface StoredTimer {
  taskId: string
  startedAt: number
  durationMs: number
  taskTitle: string
  taskType: 'regular' | 'strategic'
  taskFatigueType: 'physical' | 'emotional' | 'intellectual'
}

export interface TimerState {
  activeTaskId: string | null
  startedAt: number | null
  durationMs: number | null
  taskTitle: string | null
  taskType: 'regular' | 'strategic' | null
  taskFatigueType: 'physical' | 'emotional' | 'intellectual' | null

  startTask: (task: {
    id: string
    title: string
    task_type: string
    duration_minutes: number
    fatigue_type: 'physical' | 'emotional' | 'intellectual'
  }) => void
  cancelTask: () => void
  completeTask: () => void
  restoreFromStorage: () => StoredTimer | null

  getRemainingMs: () => number | null
  isExpired: () => boolean
}

function clearState() {
  return {
    activeTaskId: null,
    startedAt: null,
    durationMs: null,
    taskTitle: null,
    taskType: null as null,
    taskFatigueType: null as null,
  }
}

export const useTimerStore = create<TimerState>((set, get) => ({
  activeTaskId: null,
  startedAt: null,
  durationMs: null,
  taskTitle: null,
  taskType: null,
  taskFatigueType: null,

  startTask: (task) => {
    const durationMs = task.duration_minutes * 60000
    const startedAt = Date.now()

    logger.debug('timer.startTask', { taskId: task.id, durationMs, taskType: task.task_type })

    set({
      activeTaskId: task.id,
      startedAt,
      durationMs,
      taskTitle: task.title,
      taskType: task.task_type as 'regular' | 'strategic',
      taskFatigueType: task.fatigue_type,
    })

    if (typeof window !== 'undefined') {
      const stored: StoredTimer = {
        taskId: task.id,
        startedAt,
        durationMs,
        taskTitle: task.title,
        taskType: task.task_type as 'regular' | 'strategic',
        taskFatigueType: task.fatigue_type,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    }
  },

  cancelTask: () => {
    const { activeTaskId } = get()
    logger.debug('timer.cancel', { taskId: activeTaskId })

    set(clearState())

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  completeTask: () => {
    const { activeTaskId } = get()
    logger.debug('timer.completeTask cleared', { taskId: activeTaskId })

    set(clearState())

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  restoreFromStorage: () => {
    if (typeof window === 'undefined') return null

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      logger.debug('timer.restoreFromStorage', { found: false, wasExpired: false })
      return null
    }

    try {
      const stored: StoredTimer = JSON.parse(raw)
      const elapsed = Date.now() - stored.startedAt
      const wasExpired = elapsed >= stored.durationMs

      logger.debug('timer.restoreFromStorage', {
        found: true,
        wasExpired,
        elapsed,
        durationMs: stored.durationMs,
        taskId: stored.taskId,
      })

      if (!wasExpired) {
        // Restore active timer state
        set({
          activeTaskId: stored.taskId,
          startedAt: stored.startedAt,
          durationMs: stored.durationMs,
          taskTitle: stored.taskTitle,
          taskType: stored.taskType,
          taskFatigueType: stored.taskFatigueType,
        })
      } else {
        // Expired while app was closed — remove from storage, caller handles auto-complete
        localStorage.removeItem(STORAGE_KEY)
      }

      return stored
    } catch {
      logger.error('timer.restoreFromStorage: parse error, clearing storage')
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
  },

  getRemainingMs: () => {
    const { startedAt, durationMs } = get()
    if (startedAt === null || durationMs === null) return null
    return Math.max(0, durationMs - (Date.now() - startedAt))
  },

  isExpired: () => {
    const { startedAt, durationMs } = get()
    if (startedAt === null || durationMs === null) return false
    return Date.now() - startedAt >= durationMs
  },
}))
