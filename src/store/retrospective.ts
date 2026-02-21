import { create } from 'zustand'
import { createLogger } from '@/lib/logger'
import type { RetrospectiveRow, RetrospectiveFeedbackRow, RetrospectiveAdjustmentRow } from '@/lib/supabase/types'

const logger = createLogger('RetrospectiveStore')

export interface RetrospectiveState {
  retro: RetrospectiveRow | null
  feedback: RetrospectiveFeedbackRow[]
  adjustments: RetrospectiveAdjustmentRow[]
  currentPage: number          // 0 = stats, 1..N = goal pages, N+1 = adjustments
  isAgentLoading: boolean
  isCompleting: boolean

  setRetro: (retro: RetrospectiveRow | null) => void
  setFeedback: (feedback: RetrospectiveFeedbackRow[]) => void
  setAdjustments: (adjustments: RetrospectiveAdjustmentRow[]) => void
  updateAdjustment: (id: string, approved: boolean) => void
  nextPage: () => void
  prevPage: () => void
  setAgentLoading: (loading: boolean) => void
  setCompleting: (completing: boolean) => void
  reset: () => void
}

const initialState = {
  retro: null,
  feedback: [] as RetrospectiveFeedbackRow[],
  adjustments: [] as RetrospectiveAdjustmentRow[],
  currentPage: 0,
  isAgentLoading: false,
  isCompleting: false,
}

export const useRetrospectiveStore = create<RetrospectiveState>((set) => ({
  ...initialState,

  setRetro: (retro) => {
    logger.debug('setRetro', { retroId: retro?.id, status: retro?.status })
    set({ retro })
  },

  setFeedback: (feedback) => {
    logger.debug('setFeedback', { count: feedback.length })
    set({ feedback })
  },

  setAdjustments: (adjustments) => {
    logger.debug('setAdjustments', { count: adjustments.length })
    set({ adjustments })
  },

  updateAdjustment: (id, approved) => {
    logger.debug('updateAdjustment', { adjId: id, approved })
    set((state) => ({
      adjustments: state.adjustments.map((a) =>
        a.id === id ? { ...a, approved } : a
      ),
    }))
  },

  nextPage: () =>
    set((state) => {
      const next = state.currentPage + 1
      logger.debug('nextPage', { from: state.currentPage, to: next })
      return { currentPage: next }
    }),

  prevPage: () =>
    set((state) => {
      const prev = Math.max(0, state.currentPage - 1)
      logger.debug('prevPage', { from: state.currentPage, to: prev })
      return { currentPage: prev }
    }),

  setAgentLoading: (loading) => {
    logger.debug('setAgentLoading', { loading })
    set({ isAgentLoading: loading })
  },

  setCompleting: (completing) => {
    logger.debug('setCompleting', { completing })
    set({ isCompleting: completing })
  },

  reset: () => {
    logger.info('Retrospective store reset')
    set(initialState)
  },
}))
