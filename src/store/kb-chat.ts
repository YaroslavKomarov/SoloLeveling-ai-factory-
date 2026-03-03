/**
 * Zustand store for the KB chat UI.
 *
 * Manages sessions and messages for the knowledge base chat panel.
 * No persistence — sessions loaded fresh from API on mount.
 *
 * IMPORTANT: Use individual selectors (not object selectors) in components
 * to avoid Zustand getSnapshot infinite loop.
 * See: patches/2026-02-20-zustand-object-selector-loop.md
 */
import { create } from 'zustand'
import { createLogger } from '@/lib/logger'
import type { KbChatSessionRow, KbChatMessageRow } from '@/lib/supabase/types'

const logger = createLogger('KbChatStore')

// Re-export for convenience in components
export type KbChatSession = KbChatSessionRow
export type KbChatMessage = KbChatMessageRow

export interface KbChatState {
  sessions: KbChatSession[]
  activeSessionId: string | null
  messages: Record<string, KbChatMessage[]>  // keyed by sessionId
  isLoading: boolean
  streamingContent: string
  mobileView: 'sessions' | 'chat'

  setSessions: (sessions: KbChatSession[]) => void
  addSession: (session: KbChatSession) => void
  removeSession: (sessionId: string) => void
  setActiveSessionId: (sessionId: string | null) => void
  setMessages: (sessionId: string, messages: KbChatMessage[]) => void
  addMessage: (sessionId: string, message: KbChatMessage) => void
  updateSessionTitle: (sessionId: string, title: string) => void
  setIsLoading: (v: boolean) => void
  setStreamingContent: (v: string) => void
  appendStreamingContent: (chunk: string) => void
  clearStreaming: () => void
  setMobileView: (view: 'sessions' | 'chat') => void
}

export const useKbChatStore = create<KbChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: {},
  isLoading: false,
  streamingContent: '',
  mobileView: 'sessions',

  setSessions: (sessions) => {
    logger.debug('KbChatStore.setSessions', { count: sessions.length })
    set({ sessions })
  },

  addSession: (session) => {
    logger.debug('KbChatStore.addSession', { sessionId: session.id })
    set((state) => ({ sessions: [session, ...state.sessions] }))
  },

  removeSession: (sessionId) => {
    logger.debug('KbChatStore.removeSession', { sessionId })
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId)
      const messages = { ...state.messages }
      delete messages[sessionId]
      // Auto-select first remaining session if deleted one was active
      const activeSessionId =
        state.activeSessionId === sessionId
          ? (sessions[0]?.id ?? null)
          : state.activeSessionId
      return { sessions, messages, activeSessionId }
    })
  },

  setActiveSessionId: (sessionId) => {
    logger.debug('KbChatStore.setActiveSessionId', { sessionId })
    set({ activeSessionId: sessionId, streamingContent: '' })
  },

  setMessages: (sessionId, messages) => {
    logger.debug('KbChatStore.setMessages', { sessionId, count: messages.length })
    set((state) => ({
      messages: { ...state.messages, [sessionId]: messages },
    }))
  },

  addMessage: (sessionId, message) => {
    logger.debug('KbChatStore.addMessage', { sessionId, role: message.role })
    set((state) => {
      const existing = state.messages[sessionId] ?? []
      return {
        messages: { ...state.messages, [sessionId]: [...existing, message] },
      }
    })
  },

  updateSessionTitle: (sessionId, title) => {
    logger.debug('KbChatStore.updateSessionTitle', { sessionId, title })
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    }))
  },

  setIsLoading: (v) => {
    set({ isLoading: v })
  },

  setStreamingContent: (v) => {
    set({ streamingContent: v })
  },

  appendStreamingContent: (chunk) => {
    set((state) => ({ streamingContent: state.streamingContent + chunk }))
  },

  clearStreaming: () => {
    set({ streamingContent: '' })
  },

  setMobileView: (view) => {
    logger.debug('KbChatStore.setMobileView', { view })
    set({ mobileView: view })
  },
}))
