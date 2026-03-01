/**
 * Zustand store for the goal-expert chat UI.
 *
 * Manages sessions and messages for the multi-session expert chat panel.
 * No persistence — sessions are loaded fresh from the API on mount.
 *
 * IMPORTANT: Use individual selectors (not object selectors) in components
 * to avoid Zustand getSnapshot infinite loop.
 * See: patches/2026-02-22-knowledgeshell-getSnapshot-loop.md
 */
import { create } from 'zustand'
import { createLogger } from '@/lib/logger'
import type { GoalChatSessionRow, GoalChatMessageRow } from '@/lib/supabase/types'

const logger = createLogger('GoalExpertStore')

// Re-export for convenience in components
export type GoalChatSession = GoalChatSessionRow
export type GoalChatMessage = GoalChatMessageRow

export interface GoalExpertState {
  sessions: GoalChatSession[]
  activeSessionId: string | null
  messages: Record<string, GoalChatMessage[]>  // keyed by sessionId
  isLoading: boolean
  streamingContent: string

  setSessions: (sessions: GoalChatSession[]) => void
  addSession: (session: GoalChatSession) => void
  removeSession: (sessionId: string) => void
  updateSession: (sessionId: string, updates: Partial<GoalChatSession>) => void
  setActiveSession: (sessionId: string | null) => void
  setMessages: (sessionId: string, messages: GoalChatMessage[]) => void
  addMessage: (sessionId: string, message: GoalChatMessage) => void
  setLoading: (v: boolean) => void
  setStreaming: (v: string) => void
}

export const useGoalExpertStore = create<GoalExpertState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: {},
  isLoading: false,
  streamingContent: '',

  setSessions: (sessions) => {
    logger.debug('GoalExpertStore.setSessions', { count: sessions.length })
    set({ sessions })
  },

  addSession: (session) => {
    logger.debug('GoalExpertStore.addSession', { sessionId: session.id, type: session.session_type })
    set((state) => ({ sessions: [session, ...state.sessions] }))
  },

  removeSession: (sessionId) => {
    logger.debug('GoalExpertStore.removeSession', { sessionId })
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId)
      const messages = { ...state.messages }
      delete messages[sessionId]
      const activeSessionId = state.activeSessionId === sessionId ? null : state.activeSessionId
      return { sessions, messages, activeSessionId }
    })
  },

  updateSession: (sessionId, updates) => {
    logger.debug('GoalExpertStore.updateSession', { sessionId, updates })
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    }))
  },

  setActiveSession: (sessionId) => {
    logger.debug('GoalExpertStore.setActiveSession', { sessionId })
    set({ activeSessionId: sessionId, streamingContent: '' })
  },

  setMessages: (sessionId, messages) => {
    logger.debug('GoalExpertStore.setMessages', { sessionId, count: messages.length })
    set((state) => ({
      messages: { ...state.messages, [sessionId]: messages },
    }))
  },

  addMessage: (sessionId, message) => {
    logger.debug('GoalExpertStore.addMessage', { sessionId, role: message.role })
    set((state) => {
      const existing = state.messages[sessionId] ?? []
      return {
        messages: { ...state.messages, [sessionId]: [...existing, message] },
      }
    })
  },

  setLoading: (v) => {
    set({ isLoading: v })
  },

  setStreaming: (v) => {
    set({ streamingContent: v })
  },
}))
