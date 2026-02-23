'use client'

/**
 * GoalDialogModal — full-screen overlay modal for AI expert consultation on a goal.
 *
 * Layout:
 *   Left panel  (300px): goal context (title, description, quests, progress)
 *   Right panel (flex):  streaming chat interface
 *
 * Session-only chat — not persisted to DB.
 * Closes on backdrop click or Escape key.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Send, Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'
import { createLogger } from '@/lib/logger'
import type { GoalRow, QuestRow, TaskRow } from '@/lib/supabase/types'

const logger = createLogger('GoalDialogModal')

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface GoalDialogModalProps {
  goal: GoalRow
  quests: QuestRow[]
  allTasks: TaskRow[]
  progress: number
  sphereName: string
  onClose: () => void
}

const TYPE_ACCENT: Record<GoalRow['goal_type'], string> = {
  skill: '#00d4ff',
  knowledge: '#a855f7',
}

const TYPE_PROGRESS_COLOR: Record<GoalRow['goal_type'], 'physical' | 'intellectual'> = {
  skill: 'physical',
  knowledge: 'intellectual',
}

export function GoalDialogModal({
  goal,
  quests,
  allTasks,
  progress,
  sphereName,
  onClose,
}: GoalDialogModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [mounted, setMounted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  const accentColor = TYPE_ACCENT[goal.goal_type]
  const progressColor = TYPE_PROGRESS_COLOR[goal.goal_type]
  const completedTasks = allTasks.filter((t) => t.status === 'completed').length

  useEffect(() => {
    logger.debug('GoalDialog opened', { goalId: goal.id })
  }, [goal.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const sendMessage = useCallback(async () => {
    const msg = input.trim()
    if (!msg || isLoading) return

    logger.debug('GoalDialog message sent', { messageLength: msg.length })

    const prevMessages = messages
    setInput('')
    setStreamingText('')
    setIsLoading(true)

    const nextMessages: ChatMessage[] = [...prevMessages, { role: 'user', content: msg }]
    setMessages(nextMessages)

    const goalContext = {
      title: goal.title,
      description: goal.description,
      goalType: goal.goal_type,
      sphereName,
      progress,
      quests: quests.map((q) => ({
        title: q.title,
        current_value: q.current_value,
        target_value: q.target_value,
        unit: q.unit,
      })),
      totalTasks: allTasks.length,
      completedTasks,
    }

    try {
      const res = await fetch('/api/agents/goal-dialog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          messages: prevMessages, // history before new message
          goalContext,
        }),
      })

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string }
        logger.error('goal-dialog API error', { status: res.status, error: errData.error })
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${errData.error ?? 'Failed to get response'}` },
        ])
        return
      }

      if (!res.body) {
        logger.error('goal-dialog: no response body')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Empty response' }])
        return
      }

      // Stream response — toTextStreamResponse emits plain text chunks
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreamingText(accumulated)
      }

      if (accumulated) {
        setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
      }
    } catch (err) {
      logger.error('goal-dialog send error', {
        error: err instanceof Error ? err.message : String(err),
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error — please try again.' },
      ])
    } finally {
      setStreamingText('')
      setIsLoading(false)
    }
  }, [input, isLoading, messages, goal, quests, allTasks, completedTasks, progress, sphereName])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  if (!mounted) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        key="goal-dialog-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 40,
        }}
      />

      {/* Static outer div handles positioning; motion.div handles animation only */}
      <div
        style={{
          position: 'fixed',
          top: '5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90vw',
          maxWidth: '1100px',
          height: '88vh',
          zIndex: 50,
        }}
      >
      <motion.div
        key="goal-dialog-modal"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(10,12,16,0.98)',
          border: `1px solid ${accentColor}33`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.875rem 1.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.7rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: accentColor,
            }}
          >
            Expert Consultation
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body: left context panel + right chat panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: goal context */}
          <div
            style={{
              width: '300px',
              flexShrink: 0,
              borderRight: '1px solid rgba(255,255,255,0.06)',
              overflowY: 'auto',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Goal summary */}
            <div>
              <div
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.6rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.3)',
                  marginBottom: '0.5rem',
                }}
              >
                {sphereName}
              </div>
              <h3
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.4,
                }}
              >
                {goal.title}
              </h3>
              {goal.description && (
                <p
                  style={{
                    fontFamily: 'Cormorant, Georgia, serif',
                    fontSize: '0.8125rem',
                    color: 'rgba(255,255,255,0.45)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {goal.description}
                </p>
              )}
            </div>

            {/* Overall progress */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.375rem',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.6rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)',
                  }}
                >
                  Overall Progress
                </span>
                <span
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.75rem',
                    color: '#ffffff',
                  }}
                >
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} max={100} color={progressColor} height="3px" />
              <div
                style={{
                  fontFamily: 'Cormorant, Georgia, serif',
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.25)',
                  marginTop: '0.25rem',
                }}
              >
                {completedTasks} / {allTasks.length} tasks completed
              </div>
            </div>

            {/* Quests */}
            {quests.length > 0 && (
              <div>
                <div
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.6rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)',
                    marginBottom: '0.75rem',
                  }}
                >
                  Key Results
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {quests.map((quest) => {
                    const pct =
                      quest.target_value > 0
                        ? Math.min(100, (quest.current_value / quest.target_value) * 100)
                        : 0
                    return (
                      <div key={quest.id}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '0.25rem',
                            gap: '0.5rem',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'Cormorant, Georgia, serif',
                              fontSize: '0.8125rem',
                              color: 'rgba(255,255,255,0.65)',
                              lineHeight: 1.3,
                            }}
                          >
                            {quest.title}
                          </span>
                          <span
                            style={{
                              fontFamily: 'Orbitron, monospace',
                              fontSize: '0.6rem',
                              color: 'rgba(255,255,255,0.35)',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {quest.current_value}/{quest.target_value}
                          </span>
                        </div>
                        <Progress value={pct} max={100} color="white" height="2px" />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: chat panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Messages list */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {messages.length === 0 && !streamingText && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Cormorant, serif',
                    fontSize: '0.9375rem',
                    color: 'rgba(255,255,255,0.2)',
                    textAlign: 'center',
                    padding: '2rem',
                    lineHeight: 1.6,
                  }}
                >
                  Your expert advisor is ready.
                  <br />
                  Ask anything about your goal, strategies, or execution.
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '0.75rem 1rem',
                      backgroundColor:
                        msg.role === 'user' ? `${accentColor}11` : 'rgba(255,255,255,0.04)',
                      border:
                        msg.role === 'user'
                          ? `1px solid ${accentColor}33`
                          : '1px solid rgba(255,255,255,0.06)',
                      fontFamily: 'Cormorant, serif',
                      fontSize: '0.9375rem',
                      lineHeight: 1.6,
                      color:
                        msg.role === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.8)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Streaming message in progress */}
              {streamingText && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontFamily: 'Cormorant, serif',
                      fontSize: '0.9375rem',
                      lineHeight: 1.6,
                      color: 'rgba(255,255,255,0.8)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {streamingText}
                    <span
                      style={{
                        display: 'inline-block',
                        width: '2px',
                        height: '14px',
                        backgroundColor: accentColor,
                        marginLeft: '2px',
                        verticalAlign: 'middle',
                        animation: 'dialogBlink 1s step-end infinite',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Loading indicator (waiting for first chunk) */}
              {isLoading && !streamingText && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'rgba(255,255,255,0.3)',
                    paddingLeft: '0.25rem',
                  }}
                >
                  <Loader2
                    size={14}
                    style={{ animation: 'dialogSpin 1s linear infinite' }}
                  />
                  <span style={{ fontFamily: 'Cormorant, serif', fontSize: '0.8125rem' }}>
                    Consulting expert…
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                padding: '0.875rem 1.25rem',
                display: 'flex',
                gap: '0.625rem',
                alignItems: 'flex-end',
                flexShrink: 0,
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your expert advisor…"
                rows={2}
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  outline: 'none',
                  resize: 'none',
                  padding: '0.625rem 0.875rem',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '0.9375rem',
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.85)',
                  caretColor: accentColor,
                  opacity: isLoading ? 0.5 : 1,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                style={{
                  background: 'none',
                  border: `1px solid ${
                    !input.trim() || isLoading ? 'rgba(255,255,255,0.1)' : `${accentColor}55`
                  }`,
                  cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                  padding: '0.625rem',
                  color:
                    !input.trim() || isLoading ? 'rgba(255,255,255,0.2)' : accentColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                title="Send (Enter)"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      </div>

      <style>{`
        @keyframes dialogBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes dialogSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>,
    document.body
  )
}
