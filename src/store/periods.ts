/**
 * Zustand store for the daily activity-period timeline.
 * Client-only — initialised with new Date() at runtime.
 */
import { create } from 'zustand'
import { createLogger } from '@/lib/logger'
import type { PeriodWithTasks } from '@/app/api/periods/today/route'

export type { PeriodWithTasks }

const logger = createLogger('PeriodsStore')

export interface PeriodsState {
  periodsData: PeriodWithTasks[]
  isLoaded: boolean
  currentTime: Date
  expandedPeriodId: string | null

  setPeriodsData: (data: PeriodWithTasks[]) => void
  setExpandedPeriod: (id: string | null) => void
  tickTime: () => void
  setLoaded: (v: boolean) => void
}

export const usePeriodsStore = create<PeriodsState>((set) => ({
  periodsData: [],
  isLoaded: false,
  currentTime: new Date(),
  expandedPeriodId: null,

  setPeriodsData: (data) => {
    logger.debug('[PeriodsStore] loaded periods', { count: data.length })
    set({ periodsData: data, isLoaded: true })
  },

  setExpandedPeriod: (id) => {
    logger.debug('[PeriodsStore] expanded period', { periodId: id })
    set({ expandedPeriodId: id })
  },

  tickTime: () => {
    set({ currentTime: new Date() })
  },

  setLoaded: (v) => {
    set({ isLoaded: v })
  },
}))
