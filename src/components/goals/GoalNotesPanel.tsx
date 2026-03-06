'use client'

/**
 * GoalNotesPanel — inline chat-style notes panel for goal pages.
 *
 * Rendered as a tab in GoalDetailClient (tab=notes), same pattern as GoalExpertPanel.
 * On mount: loads all notes from GET /api/notes/goal/{goalId}.
 * New notes created via POST /api/notes/goal/{goalId}.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { FileText, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createLogger } from '@/lib/logger'
import type { GoalRow, NoteRow } from '@/lib/supabase/types'

const logger = createLogger('GoalNotesPanel')

interface GoalNotesPanelProps {
  goal: GoalRow
}

const TYPE_ACCENT: Record<GoalRow['goal_type'], string> = {
  skill: '#00d4ff',
  knowledge: '#a855f7',
}

export function GoalNotesPanel({ goal }: GoalNotesPanelProps) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [pathPrefix, setPathPrefix] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  const accentColor = TYPE_ACCENT[goal.goal_type]

  // Load notes on mount
  useEffect(() => {
    async function loadNotes() {
      logger.debug('[GoalNotesPanel] loading notes', { goalId: goal.id })
      try {
        const res = await fetch(`/api/notes/goal/${goal.id}`)
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          logger.error('[GoalNotesPanel] load failed', {
            goalId: goal.id,
            status: res.status,
            error: err.error,
          })
          return
        }
        const data = (await res.json()) as { notes: NoteRow[]; pathPrefix: string }
        const sorted = [...data.notes].sort((a, b) => a.title.localeCompare(b.title))
        setNotes(sorted)
        setPathPrefix(data.pathPrefix)
        logger.debug('[GoalNotesPanel] loaded notes', { goalId: goal.id, count: sorted.length })
      } catch (err) {
        logger.error('[GoalNotesPanel] load error', {
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

  const sendNote = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || isSending) return

    setSendError(null)
    setIsSending(true)

    logger.debug('[GoalNotesPanel] creating note', { goalId: goal.id, contentLength: content.length })

    try {
      const res = await fetch(`/api/notes/goal/${goal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        const msg = err.error ?? 'Failed to save note'
        logger.error('[GoalNotesPanel] create failed', {
          goalId: goal.id,
          status: res.status,
          error: msg,
        })
        setSendError(msg)
        return
      }

      const data = (await res.json()) as { note: NoteRow }
      logger.info('[GoalNotesPanel] note created', { goalId: goal.id, noteId: data.note.id })
      setNotes((prev) => [...prev, data.note])
      setInputValue('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      logger.error('[GoalNotesPanel] create error', { goalId: goal.id, error: msg })
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 320px)',
        minHeight: '500px',
        backgroundColor: 'rgba(10,12,16,0.6)',
        border: `1px solid ${accentColor}33`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.875rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          gap: '0.5rem',
        }}
      >
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
          Goal Notes
        </span>
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
    </div>
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
