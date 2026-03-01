'use client'

/**
 * GoalExpertPanel — multi-session expert chat UI for goal pages.
 *
 * Layout: SessionList (left ~240px) + ChatWindow (right, flex 1)
 *
 * Sessions:
 *   - Loaded on mount from GET /api/goals/[goalId]/chat
 *   - task sessions: created when starting a strategic task; cannot be deleted
 *   - general sessions: created via "+ New Chat"; can be deleted
 *
 * Chat:
 *   - Streams from POST /api/agents/goal-expert
 *   - Messages persisted to DB (POST .../messages)
 *   - Context compression when non-compressed messages >= 80
 *   - Timer expiry → session marked readonly if task session
 *
 * Logging:
 *   - createLogger('GoalExpertPanel') + createLogger('GoalChatWindow')
 *
 * IMPORTANT: Use individual Zustand selectors to avoid infinite loop.
 * See: patches/2026-02-22-knowledgeshell-getSnapshot-loop.md
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Loader2, Send, Lock, MessageSquare, Bookmark } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useGoalExpertStore } from '@/store/goal-expert'
import { useTimerStore } from '@/store/timer'
import { createLogger } from '@/lib/logger'
import type { GoalChatSession, GoalChatMessage } from '@/store/goal-expert'

const logger = createLogger('GoalExpertPanel')
const windowLogger = createLogger('GoalChatWindow')

// =============================================================
// Types
// =============================================================

interface GoalExpertPanelProps {
  goalId: string
  /** When starting a strategic task, this auto-creates a task session */
  initialTaskSession?: {
    taskId: string
    taskTitle: string
  }
}

// =============================================================
// GoalChatSessionList — left panel
// =============================================================

function GoalChatSessionList({ goalId }: { goalId: string }) {
  const sessions = useGoalExpertStore((s) => s.sessions)
  const activeSessionId = useGoalExpertStore((s) => s.activeSessionId)
  const setSessions = useGoalExpertStore((s) => s.setSessions)
  const addSession = useGoalExpertStore((s) => s.addSession)
  const removeSession = useGoalExpertStore((s) => s.removeSession)
  const setActiveSession = useGoalExpertStore((s) => s.setActiveSession)

  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Load sessions on mount
  useEffect(() => {
    async function loadSessions() {
      logger.debug('[GoalExpertPanel] loading sessions', { goalId })
      try {
        const res = await fetch(`/api/goals/${goalId}/chat`)
        if (!res.ok) {
          logger.error('[GoalExpertPanel] failed to load sessions', { status: res.status })
          return
        }
        const data = await res.json() as { sessions: GoalChatSession[] }
        setSessions(data.sessions)
        logger.debug('[GoalExpertPanel] sessions loaded', { count: data.sessions.length, goalId })

        // Auto-select first session if any
        if (data.sessions.length > 0) {
          setActiveSession(data.sessions[0].id)
        }
      } catch (err) {
        logger.error('[GoalExpertPanel] sessions load error', { error: err instanceof Error ? err.message : String(err) })
      }
    }
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId])

  const handleCreateSession = useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const res = await fetch(`/api/goals/${goalId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat', session_type: 'general' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        logger.error('[GoalExpertPanel] create session failed', { error: err.error })
        return
      }
      const data = await res.json() as { session: GoalChatSession }
      addSession(data.session)
      setActiveSession(data.session.id)
      logger.debug('[GoalExpertPanel] session created', { sessionId: data.session.id })
    } catch (err) {
      logger.error('[GoalExpertPanel] create session error', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsCreating(false)
    }
  }, [goalId, isCreating, addSession, setActiveSession])

  const handleDeleteSession = useCallback(async (session: GoalChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    if (session.session_type === 'task') return
    if (deletingId) return

    setDeletingId(session.id)
    try {
      const res = await fetch(`/api/goals/${goalId}/chat/${session.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        logger.error('[GoalExpertPanel] delete session failed', { sessionId: session.id, error: err.error })
        return
      }
      removeSession(session.id)
      logger.debug('[GoalExpertPanel] session deleted', { sessionId: session.id })
    } catch (err) {
      logger.error('[GoalExpertPanel] delete session error', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setDeletingId(null)
    }
  }, [goalId, deletingId, removeSession])

  return (
    <div
      style={{
        width: '240px',
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          Sessions
        </span>
        <button
          onClick={handleCreateSession}
          disabled={isCreating}
          title="New Chat"
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: isCreating ? 'not-allowed' : 'pointer',
            padding: '4px',
            color: isCreating ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isCreating ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {sessions.length === 0 && (
          <div
            style={{
              padding: '24px 14px',
              fontFamily: 'Cormorant, serif',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.2)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            No sessions yet.
            <br />
            Start a new chat.
          </div>
        )}

        <AnimatePresence initial={false}>
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId
            const isDeleting = deletingId === session.id
            const isTask = session.session_type === 'task'
            const isReadonly = session.status === 'readonly'

            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                onClick={() => setActiveSession(session.id)}
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: '8px 14px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderLeft: isActive ? '2px solid rgba(168,85,247,0.6)' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.1s',
                  position: 'relative',
                }}
              >
                {/* Session type icon */}
                <div style={{ flexShrink: 0, color: isTask ? '#a855f7' : 'rgba(255,255,255,0.3)' }}>
                  {isTask
                    ? <Bookmark size={11} />
                    : <MessageSquare size={11} />
                  }
                </div>

                {/* Title */}
                <span
                  style={{
                    fontFamily: 'Cormorant, serif',
                    fontSize: '13px',
                    color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {session.title}
                </span>

                {/* Readonly lock icon */}
                {isReadonly && (
                  <Lock size={9} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                )}

                {/* Delete button (general sessions only, on hover) */}
                {!isTask && hoveredId === session.id && !isReadonly && (
                  <button
                    onClick={(e) => handleDeleteSession(session, e)}
                    disabled={isDeleting}
                    title="Delete session"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      padding: '2px',
                      color: 'rgba(255,255,255,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isDeleting
                      ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Trash2 size={10} />
                    }
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// =============================================================
// GoalChatWindow — right panel
// =============================================================

function GoalChatWindow({ goalId }: { goalId: string }) {
  const sessions = useGoalExpertStore((s) => s.sessions)
  const activeSessionId = useGoalExpertStore((s) => s.activeSessionId)
  const messages = useGoalExpertStore((s) => s.messages)
  const isLoading = useGoalExpertStore((s) => s.isLoading)
  const streamingContent = useGoalExpertStore((s) => s.streamingContent)
  const setMessages = useGoalExpertStore((s) => s.setMessages)
  const addMessage = useGoalExpertStore((s) => s.addMessage)
  const updateSession = useGoalExpertStore((s) => s.updateSession)
  const setLoading = useGoalExpertStore((s) => s.setLoading)
  const setStreaming = useGoalExpertStore((s) => s.setStreaming)

  // Timer state (individual selectors to prevent loop)
  const activeTaskId = useTimerStore((s) => s.activeTaskId)
  const timerIsExpired = useTimerStore((s) => s.isExpired)
  const getRemainingMs = useTimerStore((s) => s.getRemainingMs)

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasMarkedReadonly = useRef<Set<string>>(new Set())

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const activeMessages = activeSessionId ? (messages[activeSessionId] ?? []) : []
  const isReadonly = activeSession?.status === 'readonly'

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) return

    async function loadMessages() {
      windowLogger.debug('[GoalChatWindow] loading messages', { sessionId: activeSessionId })
      try {
        const res = await fetch(`/api/goals/${goalId}/chat/${activeSessionId}/messages`)
        if (!res.ok) {
          windowLogger.error('[GoalChatWindow] failed to load messages', { status: res.status })
          return
        }
        const data = await res.json() as { messages: GoalChatMessage[] }
        setMessages(activeSessionId!, data.messages)
        windowLogger.debug('[GoalChatWindow] messages loaded', { sessionId: activeSessionId, count: data.messages.length })

        // Check if compression needed
        const nonCompressed = data.messages.filter((m) => !m.is_compressed_summary)
        if (nonCompressed.length >= 80) {
          windowLogger.info('[GoalChatWindow] compression triggered', { sessionId: activeSessionId, messageCount: nonCompressed.length })
          triggerCompression(data.messages, nonCompressed)
        }
      } catch (err) {
        windowLogger.error('[GoalChatWindow] messages load error', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, goalId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages, streamingContent])

  // Timer expiry → mark task session as readonly
  useEffect(() => {
    if (!activeSession) return
    if (activeSession.session_type !== 'task') return
    if (isReadonly) return
    if (hasMarkedReadonly.current.has(activeSession.id)) return

    // Poll every 5s to check timer
    const interval = setInterval(() => {
      if (timerIsExpired() && activeTaskId === activeSession.task_id) {
        clearInterval(interval)
        hasMarkedReadonly.current.add(activeSession.id)
        markSessionReadonly(activeSession.id)
      }
    }, 5000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, isReadonly, activeTaskId])

  async function markSessionReadonly(sessionId: string) {
    windowLogger.info('[GoalChatWindow] marking session readonly (timer expired)', { sessionId })
    try {
      await fetch(`/api/goals/${goalId}/chat/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'readonly' }),
      })
      updateSession(sessionId, { status: 'readonly' })

      // Send "time's up" message from assistant
      const timesUpMsg = "⏱ Time's up! Great work on this session. Take a moment to capture any key insights as a note before wrapping up."
      await saveMessage(sessionId, 'assistant', timesUpMsg)
      addMessage(sessionId, {
        id: crypto.randomUUID(),
        session_id: sessionId,
        user_id: '',
        role: 'assistant',
        content: timesUpMsg,
        is_compressed_summary: false,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      windowLogger.error('[GoalChatWindow] markSessionReadonly error', { sessionId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function saveMessage(sessionId: string, role: 'user' | 'assistant', content: string, isCompressed = false) {
    const res = await fetch(`/api/goals/${goalId}/chat/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, is_compressed_summary: isCompressed }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      windowLogger.error('[GoalChatWindow] saveMessage failed', { sessionId, role, error: err.error })
    }
    return res
  }

  async function triggerCompression(allMessages: GoalChatMessage[], nonCompressed: GoalChatMessage[]) {
    if (!activeSessionId) return
    const sessionId = activeSessionId

    const oldest40 = nonCompressed.slice(0, 40)
    const summaryPrompt = `Summarize the following ${oldest40.length} messages from a goal consultation session into a concise summary that preserves all key decisions, insights, and action items. Format as a structured markdown summary.\n\n${oldest40.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`

    windowLogger.info('[GoalChatWindow] compression started', { sessionId, oldestCount: oldest40.length })

    try {
      // Stream summary from agent
      const res = await fetch('/api/agents/goal-expert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId,
          sessionId,
          query: summaryPrompt,
          messages: [],
        }),
      })

      if (!res.ok || !res.body) {
        windowLogger.error('[GoalChatWindow] compression stream failed', { status: res.status })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let summary = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        summary += decoder.decode(value, { stream: true })
      }

      if (!summary) return

      // Save compressed summary
      await saveMessage(sessionId, 'assistant', summary, true)
      const summaryRow: GoalChatMessage = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        user_id: '',
        role: 'assistant',
        content: summary,
        is_compressed_summary: true,
        created_at: new Date().toISOString(),
      }

      // Update messages: remove oldest 40 + add summary
      const remainingMessages = allMessages.filter((m) => !oldest40.some((o) => o.id === m.id))
      setMessages(sessionId, [summaryRow, ...remainingMessages])

      windowLogger.info('[GoalChatWindow] compression complete', { sessionId, summaryLength: summary.length })
    } catch (err) {
      windowLogger.error('[GoalChatWindow] compression error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // sendMessage(displayText?, agentText?) — displayText shown to user, agentText sent to agent
  // If only displayText provided, same text is used for both.
  const sendMessage = useCallback(async (displayText?: string, agentText?: string) => {
    const rawInput = displayText ?? inputValue.trim()
    const query = rawInput.trim()
    if (!query || isLoading || !activeSessionId || isReadonly) return

    // Parse slash commands — map display text → agent instruction
    let agentQuery = agentText ?? query

    if (!agentText) {
      if (query.startsWith('/summary')) {
        agentQuery =
          'Please write a concise summary of our conversation so far. ' +
          'Extract: key insights, decisions made, open questions, action items. ' +
          'Limit to ~400 words. Format with headers.'
        windowLogger.debug('[GoalChatWindow] /summary command dispatched', { sessionId: activeSessionId })
      } else if (query.startsWith('/create-note')) {
        agentQuery =
          'Please create a note in my knowledge base summarizing this conversation. ' +
          'First summarize the key content, then use the createNote tool. ' +
          'Title should reflect the main topic of our discussion.'
        windowLogger.debug('[GoalChatWindow] /create-note command dispatched', { sessionId: activeSessionId })
      } else if (query.startsWith('/change-task')) {
        const taskName = query.replace('/change-task', '').trim()
        agentQuery = taskName
          ? `I want to change the task "${taskName}". Please ask me: what specifically doesn't work about the current wording, what I want to focus on instead. Then propose a new title and description, and ask for my confirmation before updating.`
          : 'I want to change a task. Please ask me which task and what I want to change about it.'
        windowLogger.debug('[GoalChatWindow] /change-task command dispatched', { sessionId: activeSessionId, taskName })
      }
    }

    const sessionId = activeSessionId
    const sessionMessages = messages[sessionId] ?? []

    windowLogger.debug('[GoalChatWindow] message sent', { sessionId, charCount: query.length, isCommand: query.startsWith('/') })

    setInputValue('')
    setStreaming('')
    setLoading(true)

    // Add user message optimistically to UI (show the command text, not the expanded agent prompt)
    const userMsg: GoalChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: '',
      role: 'user',
      content: query,
      is_compressed_summary: false,
      created_at: new Date().toISOString(),
    }
    addMessage(sessionId, userMsg)

    // Save user message to DB (store the display text)
    await saveMessage(sessionId, 'user', query)

    // Build task context from timer if it's a task session
    let taskContext: { taskId: string; taskTitle: string; remainingMinutes: number } | undefined
    const session = sessions.find((s) => s.id === sessionId)
    if (session?.session_type === 'task' && session.task_id && activeTaskId === session.task_id) {
      const remainingMs = getRemainingMs()
      taskContext = {
        taskId: session.task_id,
        taskTitle: session.title,
        remainingMinutes: remainingMs ? Math.ceil(remainingMs / 60000) : 0,
      }
    }

    try {
      const res = await fetch('/api/agents/goal-expert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId,
          sessionId,
          query: agentQuery,
          messages: sessionMessages.map((m) => ({ role: m.role, content: m.content })),
          taskContext,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        windowLogger.error('[GoalChatWindow] agent error', { status: res.status, error: errData.error })
        addMessage(sessionId, {
          id: crypto.randomUUID(),
          session_id: sessionId,
          user_id: '',
          role: 'assistant',
          content: `Error: ${errData.error ?? 'Failed to get response'}`,
          is_compressed_summary: false,
          created_at: new Date().toISOString(),
        })
        return
      }

      if (!res.body) {
        windowLogger.error('[GoalChatWindow] no response body')
        return
      }

      // Stream response
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let chunkCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreaming(accumulated)
        chunkCount++
      }

      windowLogger.debug('[GoalChatWindow] stream complete', { sessionId, chunks: chunkCount, length: accumulated.length })

      if (accumulated) {
        // Save assistant message to DB
        await saveMessage(sessionId, 'assistant', accumulated)

        // Add to store
        addMessage(sessionId, {
          id: crypto.randomUUID(),
          session_id: sessionId,
          user_id: '',
          role: 'assistant',
          content: accumulated,
          is_compressed_summary: false,
          created_at: new Date().toISOString(),
        })

        // Update session last_message_at
        await fetch(`/api/goals/${goalId}/chat/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_message_at: new Date().toISOString() }),
        })
      }

    } catch (err) {
      windowLogger.error('[GoalChatWindow] send error', { error: err instanceof Error ? err.message : String(err) })
      addMessage(sessionId, {
        id: crypto.randomUUID(),
        session_id: sessionId,
        user_id: '',
        role: 'assistant',
        content: 'Network error — please try again.',
        is_compressed_summary: false,
        created_at: new Date().toISOString(),
      })
    } finally {
      setStreaming('')
      setLoading(false)
    }
  }, [inputValue, isLoading, activeSessionId, isReadonly, messages, sessions, activeTaskId, getRemainingMs, goalId, addMessage, setLoading, setStreaming])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }, [sendMessage])

  if (!activeSessionId || !activeSession) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Cormorant, serif',
          fontSize: '15px',
          color: 'rgba(255,255,255,0.2)',
          textAlign: 'center',
          padding: '32px',
        }}
      >
        Select a session or create a new chat.
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
      }}
    >
      {/* Session header */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: activeSession.session_type === 'task' ? '#a855f7' : 'rgba(255,255,255,0.5)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeSession.title}
        </span>
        {isReadonly && (
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '9px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.25)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '2px 6px',
              flexShrink: 0,
            }}
          >
            Read-only
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {activeMessages.length === 0 && !streamingContent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Command hints — only shown in general sessions */}
            {activeSession.session_type !== 'task' && (
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              >
                <p
                  style={{
                    fontFamily: 'Cormorant, serif',
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: '12px',
                    marginBottom: '8px',
                    letterSpacing: '0.04em',
                  }}
                >
                  Available commands:
                </p>
                {[
                  { cmd: '/summary', desc: 'Summarize this conversation' },
                  { cmd: '/create-note', desc: 'Save conversation as a KB note' },
                  { cmd: '/change-task [task name]', desc: 'Rephrase a task title and description' },
                ].map(({ cmd, desc }) => (
                  <div
                    key={cmd}
                    onClick={() => setInputValue(cmd + ' ')}
                    style={{
                      cursor: 'pointer',
                      marginBottom: '6px',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                    }}
                  >
                    <code
                      style={{
                        color: '#a78bfa',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {cmd}
                    </code>
                    <span
                      style={{
                        color: 'rgba(255,255,255,0.35)',
                        fontSize: '13px',
                        fontFamily: 'Cormorant, serif',
                      }}
                    >
                      {desc}
                    </span>
                  </div>
                ))}
                <p
                  style={{
                    fontFamily: 'Cormorant, serif',
                    color: 'rgba(255,255,255,0.18)',
                    fontSize: '11px',
                    marginTop: '8px',
                  }}
                >
                  Note: Only task title/description can be changed via chat. Adding/removing tasks happens in Retrospective.
                </p>
              </div>
            )}

            {/* Empty state message */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Cormorant, serif',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.2)',
                textAlign: 'center',
                padding: '24px',
              }}
            >
              {activeSession.session_type === 'task'
                ? 'Your expert mentor is ready. Describe where you are with this task.'
                : 'Ask your expert anything about this goal…'}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {activeMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* Compression divider */}
              {msg.is_compressed_summary && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    opacity: 0.4,
                  }}
                >
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
                  <span
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    Session compressed
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    background: msg.role === 'user'
                      ? 'rgba(255,255,255,0.07)'
                      : msg.is_compressed_summary
                        ? 'rgba(168,85,247,0.06)'
                        : 'rgba(255,255,255,0.03)',
                    border: msg.is_compressed_summary ? '1px solid rgba(168,85,247,0.15)' : 'none',
                    fontFamily: 'Cormorant, serif',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)',
                    wordBreak: 'break-word',
                  }}
                  className={msg.role === 'assistant' ? 'expert-message' : undefined}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming message */}
        {streamingContent && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', justifyContent: 'flex-start' }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
                fontFamily: 'Cormorant, serif',
                fontSize: '14px',
                lineHeight: '1.6',
                color: 'rgba(255,255,255,0.75)',
                wordBreak: 'break-word',
              }}
              className="expert-message"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              <span
                style={{
                  display: 'inline-block',
                  width: '4px',
                  height: '14px',
                  background: 'rgba(255,255,255,0.4)',
                  marginLeft: '2px',
                  verticalAlign: 'middle',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </div>
          </motion.div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: 'Cormorant, serif', fontSize: '13px' }}>
                Thinking…
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '12px 16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          flexShrink: 0,
        }}
      >
        {isReadonly ? (
          <div
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'Cormorant, serif',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.25)',
              fontStyle: 'italic',
            }}
          >
            This session is read-only. The task timer has ended.
          </div>
        ) : (
          <>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeSession.session_type === 'task'
                ? 'Share your thoughts on this task…'
                : 'Ask your expert…'
              }
              rows={2}
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
                resize: 'none',
                padding: '10px 12px',
                fontFamily: 'Cormorant, serif',
                fontSize: '14px',
                lineHeight: '1.5',
                color: 'rgba(255,255,255,0.8)',
                caretColor: 'rgba(255,255,255,0.8)',
                opacity: isLoading ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!inputValue.trim() || isLoading}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.12)',
                cursor: (!inputValue.trim() || isLoading) ? 'not-allowed' : 'pointer',
                padding: '10px',
                color: (!inputValue.trim() || isLoading) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Send (Enter)"
            >
              <Send size={14} />
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .expert-message p { margin: 0 0 8px 0; }
        .expert-message p:last-child { margin-bottom: 0; }
        .expert-message h2 { font-size: 13px; font-weight: 600; margin: 10px 0 4px 0; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
        .expert-message h3 { font-size: 13px; font-weight: 600; margin: 8px 0 4px 0; }
        .expert-message ul, .expert-message ol { margin: 4px 0; padding-left: 16px; }
        .expert-message li { margin: 2px 0; }
        .expert-message a { color: rgba(168,85,247,0.9); text-decoration: underline; text-decoration-color: rgba(168,85,247,0.4); }
        .expert-message code { font-family: monospace; font-size: 12px; background: rgba(255,255,255,0.07); padding: 1px 4px; }
        .expert-message strong { color: rgba(255,255,255,0.9); }
        .expert-message em { color: rgba(255,255,255,0.55); }
        .expert-message hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 8px 0; }
        .expert-message blockquote { border-left: 2px solid rgba(168,85,247,0.4); margin: 4px 0; padding-left: 12px; color: rgba(255,255,255,0.55); }
      `}</style>
    </div>
  )
}

// =============================================================
// GoalExpertPanel — main exported component
// =============================================================

export function GoalExpertPanel({ goalId, initialTaskSession }: GoalExpertPanelProps) {
  const addSession = useGoalExpertStore((s) => s.addSession)
  const setActiveSession = useGoalExpertStore((s) => s.setActiveSession)
  const sessions = useGoalExpertStore((s) => s.sessions)
  const hasCreatedInitial = useRef(false)

  // Auto-create task session when initialTaskSession is provided
  useEffect(() => {
    if (!initialTaskSession || hasCreatedInitial.current) return

    // Wait until sessions are loaded to avoid duplicates
    const timer = setTimeout(async () => {
      if (hasCreatedInitial.current) return

      // Check if a task session already exists for this task
      const existing = sessions.find(
        (s) => s.session_type === 'task' && s.task_id === initialTaskSession.taskId
      )
      if (existing) {
        setActiveSession(existing.id)
        hasCreatedInitial.current = true
        logger.debug('[GoalDetailClient] newTaskSession param detected — reusing existing session', { taskId: initialTaskSession.taskId })
        return
      }

      logger.debug('[GoalDetailClient] newTaskSession param detected', { taskId: initialTaskSession.taskId })
      try {
        const res = await fetch(`/api/goals/${goalId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: initialTaskSession.taskTitle,
            session_type: 'task',
            task_id: initialTaskSession.taskId,
          }),
        })
        if (res.ok) {
          const data = await res.json() as { session: GoalChatSession }
          addSession(data.session)
          setActiveSession(data.session.id)
          hasCreatedInitial.current = true
        }
      } catch (err) {
        logger.error('[GoalExpertPanel] failed to create initial task session', { error: err instanceof Error ? err.message : String(err) })
      }
    }, 500) // short delay for sessions to load

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskSession, sessions, goalId])

  return (
    <div
      style={{
        display: 'flex',
        height: '600px',
        border: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(10,12,16,0.6)',
      }}
    >
      <GoalChatSessionList goalId={goalId} />
      <GoalChatWindow goalId={goalId} />
    </div>
  )
}
