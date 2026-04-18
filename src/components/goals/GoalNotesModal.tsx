'use client'

/**
 * GoalNotesModal — chat-style overlay for goal notes.
 *
 * On open: loads all notes for the goal from GET /api/notes/goal/{goalId}.
 * Each note is a separate entry displayed in chronological order.
 * New notes are created via POST /api/notes/goal/{goalId} and timestamped automatically.
 *
 * Notes are stored in the Knowledge Base under: {sphere}/{goal}/{datetime}
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, FileText, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createLogger } from '@/lib/logger'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { GoalRow, NoteRow } from '@/lib/supabase/types'

const logger = createLogger('GoalNotesModal')

interface GoalNotesModalProps {
  goal: GoalRow
  onClose: () => void
}

const TYPE_ACCENT: Record<GoalRow['goal_type'], string> = {
  skill: '#00d4ff',
  knowledge: '#a855f7',
}

export function GoalNotesModal({ goal, onClose }: GoalNotesModalProps) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [pathPrefix, setPathPrefix] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const isMobile = useIsMobile()

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    logger.debug('modal opened on mobile', { isMobile, viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0 })
  }, [isMobile])

  const accentColor = TYPE_ACCENT[goal.goal_type]

  // Load notes on mount
  useEffect(() => {
    async function loadNotes() {
      logger.debug('[GoalNotesModal] loading notes', { goalId: goal.id })
      try {
        const res = await fetch(`/api/notes/goal/${goal.id}`)
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          logger.error('[GoalNotesModal] load failed', {
            goalId: goal.id,
            status: res.status,
            error: err.error,
          })
          return
        }
        const data = (await res.json()) as { notes: NoteRow[]; pathPrefix: string }
        // Sort chronologically by title (datetime string "YYYY-MM-DD HH:mm")
        const sorted = [...data.notes].sort((a, b) => a.title.localeCompare(b.title))
        setNotes(sorted)
        setPathPrefix(data.pathPrefix)
        logger.debug('[GoalNotesModal] loaded notes', { goalId: goal.id, count: sorted.length })
      } catch (err) {
        logger.error('[GoalNotesModal] load error', {
          goalId: goal.id,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadNotes()
  }, [goal.id])

  // Scroll to bottom when notes change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [notes])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const sendNote = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || isSending) return

    setSendError(null)
    setIsSending(true)

    logger.debug('[GoalNotesModal] creating note', { goalId: goal.id, contentLength: content.length })

    try {
      const res = await fetch(`/api/notes/goal/${goal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        const msg = err.error ?? 'Failed to save note'
        logger.error('[GoalNotesModal] create failed', {
          goalId: goal.id,
          status: res.status,
          error: msg,
        })
        setSendError(msg)
        return
      }

      const data = (await res.json()) as { note: NoteRow }
      logger.info('[GoalNotesModal] note created', { goalId: goal.id, noteId: data.note.id })
      setNotes((prev) => [...prev, data.note])
      setInputValue('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      logger.error('[GoalNotesModal] create error', { goalId: goal.id, error: msg })
      setSendError(msg)
    } finally {
      setIsSending(false)
    }
  }, [inputValue, isSending, goal.id])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void sendNote()
      }
    },
    [sendNote]
  )

  if (!mounted) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        key="goal-notes-backdrop"
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

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: isMobile ? '2vh' : '5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isMobile ? '95vw' : '90vw',
          maxWidth: '800px',
          height: isMobile ? '90vh' : '88vh',
          zIndex: 50,
        }}
      >
        <motion.div
          key="goal-notes-modal"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={13} style={{ color: accentColor }} />
              <span
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: accentColor,
                }}
              >
                Goal Notes — {goal.title}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)',
                padding: isMobile ? '14px' : '4px',
                display: 'flex',
                alignItems: 'center',
                minHeight: isMobile ? '44px' : undefined,
                minWidth: isMobile ? '44px' : undefined,
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Path breadcrumb */}
          {pathPrefix && (
            <div
              style={{
                padding: '0.4rem 1.25rem',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.6rem',
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.2)',
                flexShrink: 0,
              }}
            >
              {pathPrefix}/
            </div>
          )}

          {/* Notes scroll area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {isLoading ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '0.9375rem',
                  color: 'rgba(255,255,255,0.2)',
                }}
              >
                Loading…
              </div>
            ) : notes.length === 0 ? (
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
                  lineHeight: 1.7,
                }}
              >
                No notes yet. Add your first thought below.
              </div>
            ) : (
              notes.map((note) => (
                <NoteCard key={note.id} note={note} accentColor={accentColor} />
              ))
            )}
          </div>

          {/* Input area */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '0.75rem 1.25rem',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {sendError && (
              <div
                style={{
                  fontFamily: 'Cormorant, serif',
                  fontSize: '0.8125rem',
                  color: '#ec4899',
                }}
              >
                {sendError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a note… (Enter to send, Shift+Enter for new line)"
                rows={3}
                disabled={isSending}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${accentColor}33`,
                  outline: 'none',
                  resize: 'none',
                  padding: '0.625rem 0.875rem',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '0.9375rem',
                  lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.85)',
                  caretColor: accentColor,
                  boxSizing: 'border-box',
                  opacity: isSending ? 0.5 : 1,
                }}
              />
              <button
                onClick={() => void sendNote()}
                disabled={!inputValue.trim() || isSending}
                style={{
                  background: accentColor,
                  border: 'none',
                  cursor: !inputValue.trim() || isSending ? 'default' : 'pointer',
                  padding: '0.625rem 0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !inputValue.trim() || isSending ? 0.4 : 1,
                  transition: 'opacity 0.15s ease',
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                }}
              >
                <Send size={16} color="#000" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// NoteCard — single chat note entry
// ---------------------------------------------------------------------------

interface NoteCardProps {
  note: NoteRow
  accentColor: string
}

function NoteCard({ note, accentColor }: NoteCardProps) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${accentColor}55`,
        paddingLeft: '0.875rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }}
    >
      {/* Timestamp header */}
      <div
        style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: '0.6rem',
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.3)',
        }}
      >
        {note.title}
      </div>

      {/* Markdown content */}
      <div
        style={{
          fontFamily: 'Cormorant, serif',
          fontSize: '0.9375rem',
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.8)',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p style={{ margin: '0 0 0.5rem 0', fontFamily: 'Cormorant, serif', fontSize: '0.9375rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.8)' }}>
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul style={{ paddingLeft: '1.25rem', margin: '0 0 0.5rem 0' }}>{children}</ul>
            ),
            ol: ({ children }) => (
              <ol style={{ paddingLeft: '1.25rem', margin: '0 0 0.5rem 0' }}>{children}</ol>
            ),
            li: ({ children }) => (
              <li style={{ fontFamily: 'Cormorant, serif', fontSize: '0.9375rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.8)', marginBottom: '0.125rem' }}>
                {children}
              </li>
            ),
            code: ({ children }) => (
              <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.8)' }}>
                {children}
              </code>
            ),
            strong: ({ children }) => (
              <strong style={{ color: '#fff', fontWeight: 600 }}>{children}</strong>
            ),
            em: ({ children }) => (
              <em style={{ color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' }}>{children}</em>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>
                {children}
              </a>
            ),
          }}
        >
          {note.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
