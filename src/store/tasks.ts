import { create } from 'zustand'
import type { TaskRow } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TasksStore')

export interface LevelUpPending {
  level: number
  previousLevel: number
}

export interface TasksState {
  todaysTasks: TaskRow[]
  isLoaded: boolean
  levelUpPending: LevelUpPending | null

  setTodaysTasks: (tasks: TaskRow[]) => void
  updateTask: (id: string, updates: Partial<TaskRow>) => void
  setLevelUpPending: (level: number, previousLevel: number) => void
  clearLevelUp: () => void
}

export const useTasksStore = create<TasksState>((set) => ({
  todaysTasks: [],
  isLoaded: false,
  levelUpPending: null,

  setTodaysTasks: (tasks) => {
    logger.debug(`Loaded ${tasks.length} tasks for today`)
    set({ todaysTasks: tasks, isLoaded: true })
  },

  updateTask: (id, updates) => {
    logger.debug(`Task ${id} updated`, updates)
    set((state) => ({
      todaysTasks: state.todaysTasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }))
  },

  setLevelUpPending: (level, previousLevel) => {
    logger.info('Level-up state set', { previousLevel, level })
    set({ levelUpPending: { level, previousLevel } })
  },

  clearLevelUp: () => {
    logger.debug('Level-up state cleared')
    set({ levelUpPending: null })
  },
}))
