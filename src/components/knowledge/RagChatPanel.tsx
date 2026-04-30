'use client'

/**
 * RagChatPanel — right panel chat interface for the knowledge RAG agent.
 * Uses custom fetch-based streaming (matching existing agent dialog patterns).
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Trash2, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useKnowledgeStore } from '@/store/knowledge'
import type { ChatMessage } from '@/store/knowledge'
import { MAX_HISTORY_MESSAGES } from '@/lib/agents/knowledge-rag/constants'
import { createLogger } from '@/lib/logger'
import { useIsMobile } from '@/hooks/useIsMobile'

const logger = createLogger('RagChatPanel')

export function RagChatPanel() {
  // [FIX:T01] Split into individual selectors to avoid Zustand getSnapshot infinite loop.
  // Inline object selector `(s) => ({ ... })` creates a new object on every call,
  // causing React to detect "state change" → infinite re-render.
  const isMobile = useIsMobile()
  const chatMessages = useKnowledgeStore((s) => s.chatMessages)
  const isChatLoading = useKnowledgeStore((s) => s.isChatLoading)
  const addChatMessage = useKnowledgeStore((s) => s.addChatMessage)
  const setChatMessages = useKnowledgeStore((s) => s.setChatMessages)
  const setIsChatLoading = useKnowledgeStore((s) => s.setIsChatLoading)
  const clearChat = useKnowledgeStore((s) => s.clearChat)
  const notes = useKnowledgeStore((s) => s.notes)
  const selectNote = useKnowledgeStore((s) => s.selectNote)

  const [inputValue, setInputValue] = useState('')
  const [streamingMessage, setStreamingMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // [FIX:T01] Log mount to confirm no infinite loop regression
  useEffect(() => {
    logger.debug('[FIX:T01] RagChatPanel mounted — split selectors active', {
      maxHistoryMessages: MAX_HISTORY_MESSAGES,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingMessage])

  const sendMessage = useCallback(async () => {
    const query = inputValue.trim()
    if (!query || isChatLoading) return

    logger.debug('Sending message', { queryLength: query.length, historyCount: chatMessages.length })

    setInputValue('')
    setStreamingMessage('')
    setIsChatLoading(true)

    // Add user message immediately
    const userMsg: ChatMessage = { role: 'user', content: query }
    addChatMessage(userMsg)

    try {
      const res = await fetch('/api/agents/knowledge-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          messages: chatMessages, // history before the new message
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        logger.error('RAG API error', { status: res.status, error: errData.error })
        addChatMessage({
          role: 'assistant',
          content: `Error: ${errData.error ?? 'Failed to get response'}`,
        })
        return
      }

      if (!res.body) {
        logger.error('No response body from RAG API')
        addChatMessage({ role: 'assistant', content: 'Error: Empty response' })
        return
      }

      // Stream response — toTextStreamResponse() emits plain text chunks
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let chunkCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreamingMessage(accumulated)
        chunkCount++
      }

      logger.debug('RAG stream complete', { chunks: chunkCount, responseLength: accumulated.length })

      if (accumulated) {
        addChatMessage({ role: 'assistant', content: accumulated })
      }

    } catch (err) {
      logger.error('RAG chat send error', { error: err instanceof Error ? err.message : String(err) })
      addChatMessage({
        role: 'assistant',
        content: 'Network error — please try again.',
      })
    } finally {
      setStreamingMessage('')
      setIsChatLoading(false)
    }
  }, [inputValue, isChatLoading, chatMessages, addChatMessage, setIsChatLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage, isMobile]
  )

  const handleClearChat = useCallback(() => {
    logger.debug('Clearing RAG chat')
    clearChat()
    setStreamingMessage('')
  }, [clearChat])

  // Resolve note path to ID for clickable source links in RAG responses
  const resolveNoteByPath = useCallback(
    (path: string): string | null => {
      const found = notes.find((n) => n.path === path || n.path === path.replace(/^\//, ''))
      return found?.id ?? null
    },
    [notes]
  )

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
      if (href && !href.startsWith('http')) {
        const noteId = resolveNoteByPath(href)
        if (noteId) {
          return (
            <span
              onClick={() => {
                logger.debug('RAG source link clicked', { href, noteId })
                selectNote(noteId)
              }}
              style={{
                color: 'rgba(200,180,120,0.9)',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(200,180,120,0.4)',
                cursor: 'pointer',
              }}
              title="Open note"
            >
              {children}
            </span>
          )
        }
        // Path found in response but note not in local list yet — render dimmed
        return (
          <span
            style={{
              color: 'rgba(255,255,255,0.35)',
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
            }}
            title={`Note not loaded: ${href}`}
          >
            {children}
          </span>
        )
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'rgba(200,180,120,0.9)', textDecoration: 'underline', textDecorationColor: 'rgba(200,180,120,0.4)' }}
          {...props}
        >
          {children}
        </a>
      )
    },
  }), [resolveNoteByPath, selectNote])

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          Knowledge Oracle
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {chatMessages.length > 0 && (
            <span
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '10px',
                color: chatMessages.length >= MAX_HISTORY_MESSAGES
                  ? 'rgba(255,255,255,0.45)'
                  : 'rgba(255,255,255,0.2)',
              }}
              title={`${chatMessages.length} of ${MAX_HISTORY_MESSAGES} context messages used`}
            >
              {chatMessages.length} / {MAX_HISTORY_MESSAGES}
            </span>
          )}
          {chatMessages.length > 0 && (
            <button
              onClick={handleClearChat}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.25)' }}
              title="Clear chat"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {chatMessages.length === 0 && !streamingMessage && (
          <div
            style={{
              flex: 1,
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
            Ask your knowledge base anything…
          </div>
        )}

        <AnimatePresence initial={false}>
          {chatMessages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  background: msg.role === 'user'
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(255,255,255,0.04)',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: msg.role === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)',
                  wordBreak: 'break-word',
                }}
                className={msg.role === 'assistant' ? 'rag-assistant-message' : undefined}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming message (in progress) */}
        {streamingMessage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', justifyContent: 'flex-start' }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)',
                fontFamily: 'Cormorant, serif',
                fontSize: '14px',
                lineHeight: '1.6',
                color: 'rgba(255,255,255,0.75)',
                wordBreak: 'break-word',
              }}
              className="rag-assistant-message"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {streamingMessage}
              </ReactMarkdown>
              <span
                style={{
                  display: 'inline-block',
                  width: '4px',
                  height: '14px',
                  background: 'rgba(255,255,255,0.5)',
                  marginLeft: '2px',
                  verticalAlign: 'middle',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </div>
          </motion.div>
        )}

        {/* Loading indicator */}
        {isChatLoading && !streamingMessage && (
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
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: 'Cormorant, serif', fontSize: '13px' }}>
                Searching notes…
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '12px 16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your knowledge base…"
          rows={2}
          disabled={isChatLoading}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            outline: 'none',
            resize: 'none',
            padding: '10px 12px',
            fontFamily: 'Cormorant, serif',
            fontSize: '14px',
            lineHeight: '1.5',
            color: 'rgba(255,255,255,0.8)',
            caretColor: 'rgba(255,255,255,0.8)',
            opacity: isChatLoading ? 0.5 : 1,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!inputValue.trim() || isChatLoading}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: (!inputValue.trim() || isChatLoading) ? 'not-allowed' : 'pointer',
            padding: '10px',
            color: (!inputValue.trim() || isChatLoading) ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Send (Enter)"
        >
          <Send size={15} />
        </button>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rag-assistant-message p { margin: 0 0 8px 0; }
        .rag-assistant-message p:last-child { margin-bottom: 0; }
        .rag-assistant-message h2 { font-size: 13px; font-weight: 600; margin: 10px 0 4px 0; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
        .rag-assistant-message h3 { font-size: 13px; font-weight: 600; margin: 8px 0 4px 0; }
        .rag-assistant-message ul { margin: 4px 0; padding-left: 16px; }
        .rag-assistant-message li { margin: 2px 0; }
        .rag-assistant-message a { color: rgba(200,180,120,0.9); text-decoration: underline; text-decoration-color: rgba(200,180,120,0.4); }
        .rag-assistant-message a:hover { color: rgba(220,200,140,1); }
        .rag-assistant-message code { font-family: monospace; font-size: 12px; background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; }
        .rag-assistant-message em { color: rgba(255,255,255,0.55); }
        .rag-assistant-message strong { color: rgba(255,255,255,0.9); }
        .rag-assistant-message hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0; }
      `}</style>
    </div>
  )
}
