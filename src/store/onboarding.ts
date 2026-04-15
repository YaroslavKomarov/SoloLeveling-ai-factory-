import { create } from 'zustand'
import type { ActivityPeriodRow } from '@/lib/supabase/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type OnboardingPhase =
  | 'welcome'
  | 'profile'
  | 'schedulerbot'
  | 'spheres'
  | 'push'
  | 'complete'

interface OnboardingState {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  phase: OnboardingPhase
  periods: ActivityPeriodRow[]

  // actions
  addMessage: (msg: ChatMessage) => void
  setStreaming: (isStreaming: boolean, content: string) => void
  setPhase: (phase: OnboardingPhase) => void
  setPeriods: (periods: ActivityPeriodRow[]) => void
  reset: () => void
}

const initialState = {
  messages: [],
  isStreaming: false,
  streamingContent: '',
  phase: 'welcome' as OnboardingPhase,
  periods: [],
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  setStreaming: (isStreaming, content) =>
    set({ isStreaming, streamingContent: content }),

  setPhase: (phase) => set({ phase }),

  setPeriods: (periods) => set({ periods }),

  reset: () => set(initialState),
}))
