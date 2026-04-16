/**
 * Goal creation dialog state machine.
 * Manages the multi-phase AI chat flow for creating a new goal.
 */
import { create } from 'zustand'
import type { QueuePlanResult, FeasibilityResult, GoalType, QuestDraft } from '@/lib/supabase/types'

type DialogPhase = 'idle' | 'gathering' | 'quests' | 'planning' | 'preview' | 'confirmed' | 'synthesis'

interface DialogMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface GoalDialogState {
  isOpen: boolean
  sphereId: string | null
  phase: DialogPhase
  messages: DialogMessage[]
  draftGoalType: GoalType | null
  draftGoalTitle: string | null
  draftQuests: QuestDraft[]
  planResult: QueuePlanResult | null
  deadlineDate: string | null
  feasibility: FeasibilityResult | null
  isLoading: boolean
  error: string | null
  /** Synthesized note content returned by the suggestNoteContent tool */
  synthesisNote: { title: string; content: string } | null
  /** ID of the goal created after confirmation — used for note creation */
  createdGoalId: string | null

  openDialog: (sphereId: string) => void
  closeDialog: () => void
  setPhase: (phase: DialogPhase) => void
  addMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void
  setStreamingMessage: (content: string) => void
  finalizeStreamingMessage: () => void
  setDraftQuests: (quests: QuestDraft[]) => void
  updateDraftQuest: (index: number, updates: Partial<QuestDraft>) => void
  setDraftGoalType: (type: GoalType) => void
  setDraftGoalTitle: (title: string) => void
  setPlanResult: (result: QueuePlanResult) => void
  setDeadlineDate: (date: string) => void
  setFeasibility: (result: FeasibilityResult | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSynthesisNote: (note: { title: string; content: string } | null) => void
  setCreatedGoalId: (goalId: string) => void
  reset: () => void
}

const initialState = {
  isOpen: false,
  sphereId: null,
  phase: 'idle' as DialogPhase,
  messages: [],
  draftGoalType: null,
  draftGoalTitle: null,
  draftQuests: [],
  planResult: null,
  deadlineDate: null,
  feasibility: null,
  isLoading: false,
  error: null,
  synthesisNote: null,
  createdGoalId: null,
}

export const useGoalDialogStore = create<GoalDialogState>((set) => ({
  ...initialState,

  openDialog: (sphereId) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[goal-dialog] openDialog', { sphereId })
    }
    set({ isOpen: true, sphereId, phase: 'gathering', error: null })
  },

  closeDialog: () => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[goal-dialog] closeDialog')
    }
    set({ isOpen: false })
  },

  setPhase: (phase) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[goal-dialog] phase transition', { to: phase })
    }
    set({ phase })
  },

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { ...msg, isStreaming: false }],
    })),

  /** Append a streaming delta to the last assistant message (or start a new one) */
  setStreamingMessage: (delta) =>
    set((state) => {
      const last = state.messages[state.messages.length - 1]
      if (last?.isStreaming) {
        // Accumulate delta into existing streaming message
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { role: 'assistant', content: last.content + delta, isStreaming: true },
          ],
        }
      }
      // Start new streaming message with first delta
      return {
        messages: [
          ...state.messages,
          { role: 'assistant', content: delta, isStreaming: true },
        ],
      }
    }),

  /** Mark the last streaming message as complete */
  finalizeStreamingMessage: () =>
    set((state) => {
      const last = state.messages[state.messages.length - 1]
      if (!last?.isStreaming) return state
      return {
        messages: [
          ...state.messages.slice(0, -1),
          { ...last, isStreaming: false },
        ],
      }
    }),

  setDraftQuests: (quests) => set({ draftQuests: quests }),

  updateDraftQuest: (index, updates) =>
    set((state) => ({
      draftQuests: state.draftQuests.map((q, i) =>
        i === index ? { ...q, ...updates } : q
      ),
    })),

  setDraftGoalType: (type) => set({ draftGoalType: type }),

  setDraftGoalTitle: (title) => set({ draftGoalTitle: title }),

  setPlanResult: (result) => set({ planResult: result }),

  setDeadlineDate: (date) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[goal-dialog] setDeadlineDate', { date })
    }
    set({ deadlineDate: date })
  },

  setFeasibility: (result) => set({ feasibility: result }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setSynthesisNote: (note) => set({ synthesisNote: note }),

  setCreatedGoalId: (goalId) => set({ createdGoalId: goalId }),

  reset: () => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[goal-dialog] reset')
    }
    set(initialState)
  },
}))
