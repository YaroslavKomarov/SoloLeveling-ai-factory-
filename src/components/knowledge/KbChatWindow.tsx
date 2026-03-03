'use client'

/**
 * KbChatWindow — chat view for a single KB session.
 *
 * Responsibilities:
 *   - Fetches messages for session on mount / when sessionId changes
 *   - Renders messages with ReactMarkdown
 *   - Shows streaming content with blinking cursor
 *   - Input: textarea + send button; Enter sends on desktop, button-only on mobile
 *   - Auto-scrolls to bottom on new messages / streaming updates
 *
 * Layout:
 *   - Desktop: flex-1, no back button
 *   - Mobile: full screen, top bar with ChevronLeft + session title
 *
 * Streaming: calls POST /api/agents/knowledge-rag, reads stream chunks,
 * appends to store.streamingContent, on complete → clearStreaming + addMessage.
 * The route handles DB persistence of both user and assistant messages.
 *
 * IMPORTANT: Use individual Zustand selectors to avoid infinite loop.
 * See: patches/2026-02-20-zustand-object-selector-loop.md
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, Loader2, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useKbChatStore } from '@/store/kb-chat'
import { useIsMobile } from '@/hooks/useIsMobile'
import { createLogger } from '@/lib/logger'
import type { KbChatMessage } from '@/store/kb-chat'

const logger = createLogger('KbChatWindow')

interface KbChatWindowProps {
  sessionId: string
  onBack?: () => void
}

export function KbChatWindow({ sessionId, onBack }: KbChatWindowProps) {
  // Individual selectors — avoid Zustand object-selector infinite loop
  const sessions = useKbChatStore((s) => s.sessions)
  const messages = useKbChatStore((s) => s.messages)
  const isLoading = useKbChatStore((s) => s.isLoading)
  const streamingContent = useKbChatStore((s) => s.streamingContent)
  const setMessages = useKbChatStore((s) => s.setMessages)
  const addMessage = useKbChatStore((s) => s.addMessage)
  const setIsLoading = useKbChatStore((s) => s.setIsLoading)
  const setStreamingContent = useKbChatStore((s) => s.setStreamingContent)
  const clearStreaming = useKbChatStore((s) => s.clearStreaming)
  const updateSessionTitle = useKbChatStore((s) => s.updateSessionTitle)

  const isMobile = useIsMobile()
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const session = sessions.find((s) => s.id === sessionId)
  const sessionTitle = session?.title ?? 'New Chat'
  const activeMessages = messages[sessionId] ?? []

  // Fetch messages on mount / when sessionId changes
  useEffect(() => {
    if (!sessionId) return

    async function loadMessages() {
      logger.debug('[KbChatWindow] loading messages', { sessionId })
      try {
        const res = await fetch(`/api/kb/sessions/${sessionId}/messages`)
        if (!res.ok) {
          logger.error('[KbChatWindow] failed to load messages', { status: res.status, sessionId })
          return
        }
        const data = await res.json() as { messages: KbChatMessage[] }
        setMessages(sessionId, data.messages)
        logger.debug('[KbChatWindow] messages loaded', { sessionId, count: data.messages.length })
      } catch (err) {
        logger.error('[KbChatWindow] messages load error', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages, streamingContent])

  const sendMessage = useCallback(async () => {
    const query = inputValue.trim()
    if (!query || isLoading) return

    logger.debug('[KbChatWindow] sending message', { sessionId, charCount: query.length })

    const historyMessages = messages[sessionId] ?? []

    setInputValue('')
    setIsLoading(true)
    setStreamingContent('')

    // Add user message optimistically
    const userMsg: KbChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: '',
      role: 'user',
      content: query,
      is_compressed_summary: false,
      created_at: new Date().toISOString(),
    }
    addMessage(sessionId, userMsg)

    try {
      const res = await fetch('/api/agents/knowledge-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          query,
          // Pass history (before the new user message); route persists user msg itself
          messages: historyMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            isCompressedSummary: m.is_compressed_summary,
          })),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        logger.error('[KbChatWindow] agent error', { sessionId, status: res.status, error: errData.error })
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
        logger.error('[KbChatWindow] no response body', { sessionId })
        return
      }

      // Read stream
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let chunkCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreamingContent(accumulated)
        chunkCount++
      }

      logger.debug('[KbChatWindow] stream complete', {
        sessionId,
        chunks: chunkCount,
        length: accumulated.length,
      })

      if (accumulated) {
        clearStreaming()
        addMessage(sessionId, {
          id: crypto.randomUUID(),
          session_id: sessionId,
          user_id: '',
          role: 'assistant',
          content: accumulated,
          is_compressed_summary: false,
          created_at: new Date().toISOString(),
        })

        // Fetch updated session title if this was an early exchange (server generates it async)
        const currentSession = sessions.find((s) => s.id === sessionId)
        if (!currentSession?.title && historyMessages.length <= 2) {
          setTimeout(async () => {
            try {
              const sessionRes = await fetch(`/api/kb/sessions/${sessionId}`)
              if (sessionRes.ok) {
                const data = await sessionRes.json() as { session: { title: string | null } }
                if (data.session?.title) {
                  updateSessionTitle(sessionId, data.session.title)
                  logger.debug('[KbChatWindow] session title updated from server', { sessionId, title: data.session.title })
                }
              }
            } catch (_) { /* non-fatal */ }
          }, 3000)
        }
      }
    } catch (err) {
      logger.error('[KbChatWindow] send error', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
      clearStreaming()
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
      setIsLoading(false)
      clearStreaming()
    }
  }, [
    inputValue,
    isLoading,
    sessionId,
    sessions,
    messages,
    addMessage,
    setIsLoading,
    setStreamingContent,
    clearStreaming,
    updateSessionTitle,
  ])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Desktop: Enter sends; Shift+Enter inserts newline
    // Mobile: Enter inserts newline (user sends via button)
    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        height: '100%',
        background: '#0a0c10',
      }}
    >
      {/* Mobile top bar */}
      {isMobile && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
              title="Back to sessions"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sessionTitle}
          </span>
        </div>
      )}

      {/* Messages area */}
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
        {activeMessages.length === 0 && !streamingContent && !isLoading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Cormorant, serif',
              fontSize: '15px',
              color: 'rgba(255,255,255,0.18)',
              fontStyle: 'italic',
            }}
          >
            Start a conversation...
          </div>
        )}

        {activeMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming assistant message */}
        {streamingContent && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignSelf: 'flex-start',
              maxWidth: '85%',
            }}
          >
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '9px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.25)',
              }}
            >
              Oracle
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '10px 14px',
                fontFamily: 'Cormorant, serif',
                fontSize: '15px',
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              <MarkdownContent content={streamingContent} />
              <span
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '14px',
                  background: 'rgba(255,255,255,0.6)',
                  marginLeft: '2px',
                  verticalAlign: 'text-bottom',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </div>
          </div>
        )}

        {/* Loading indicator (before first chunk) */}
        {isLoading && !streamingContent && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: 'Cormorant, serif', fontSize: '13px' }}>
              Thinking...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your notes..."
          disabled={isLoading}
          rows={1}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '10px 14px',
            fontFamily: 'Cormorant, serif',
            fontSize: '15px',
            color: 'rgba(255,255,255,0.85)',
            outline: 'none',
            caretColor: 'rgba(255,255,255,0.8)',
            resize: 'none',
            lineHeight: 1.5,
            maxHeight: '120px',
            overflowY: 'auto',
            opacity: isLoading ? 0.5 : 1,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !inputValue.trim()}
          title="Send"
          style={{
            background: inputValue.trim() && !isLoading
              ? 'rgba(168,85,247,0.2)'
              : 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
            padding: '10px 12px',
            color: inputValue.trim() && !isLoading
              ? 'rgba(168,85,247,0.9)'
              : 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {isLoading
            ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            : <Send size={16} />
          }
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}

// =============================================================
// Sub-components
// =============================================================

function MessageBubble({ message }: { message: KbChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
      }}
    >
      <div
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '9px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.25)',
          textAlign: isUser ? 'right' : 'left',
        }}
      >
        {isUser ? 'You' : 'Oracle'}
        {message.is_compressed_summary && (
          <span style={{ marginLeft: '6px', color: 'rgba(168,85,247,0.5)' }}>[summary]</span>
        )}
      </div>

      <div
        style={{
          background: isUser ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          border: isUser
            ? '1px solid rgba(255,255,255,0.1)'
            : '1px solid rgba(255,255,255,0.06)',
          padding: '10px 14px',
          fontFamily: 'Cormorant, serif',
          fontSize: '15px',
          lineHeight: 1.6,
          color: isUser ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)',
        }}
      >
        {isUser
          ? <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
          : <MarkdownContent content={message.content} />
        }
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p style={{ margin: '0 0 8px 0', fontFamily: 'Cormorant, serif', fontSize: '15px', lineHeight: 1.6 }}>
            {children}
          </p>
        ),
        code: ({ children, ...props }) => {
          const isBlock = 'className' in props
          if (isBlock) {
            return (
              <pre style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 12px', overflow: 'auto', margin: '8px 0' }}>
                <code style={{ fontFamily: 'monospace', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                  {children}
                </code>
              </pre>
            )
          }
          return (
            <code style={{ fontFamily: 'monospace', fontSize: '13px', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', color: 'rgba(255,255,255,0.7)' }}>
              {children}
            </code>
          )
        },
        ul: ({ children }) => (
          <ul style={{ paddingLeft: '20px', margin: '4px 0 8px 0' }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ paddingLeft: '20px', margin: '4px 0 8px 0' }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ fontFamily: 'Cormorant, serif', fontSize: '15px', lineHeight: 1.6 }}>{children}</li>
        ),
        h1: ({ children }) => (
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', fontWeight: 600, letterSpacing: '0.06em', margin: '12px 0 6px', color: 'rgba(255,255,255,0.9)' }}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', margin: '10px 0 4px', color: 'rgba(255,255,255,0.85)' }}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', margin: '8px 0 4px', color: 'rgba(255,255,255,0.8)' }}>
            {children}
          </h3>
        ),
        strong: ({ children }) => (
          <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{children}</strong>
        ),
        a: ({ href, children }) => (
          <a href={href} style={{ color: 'rgba(168,85,247,0.8)', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote style={{ borderLeft: '2px solid rgba(255,255,255,0.15)', paddingLeft: '12px', margin: '8px 0', color: 'rgba(255,255,255,0.5)' }}>
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
