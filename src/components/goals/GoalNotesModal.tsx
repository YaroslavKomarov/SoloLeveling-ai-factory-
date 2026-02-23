'use client'

/**
 * GoalNotesModal — full-screen overlay modal for editing the goal's markdown note.
 *
 * On open: fetches (or creates) the note at path `goals/{goalId}/goal.md`.
 * Auto-saves content via PATCH /api/notes/[noteId] with 1.5s debounce.
 * Closes on backdrop click or Escape key.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, FileText } from 'lucide-react'
import { createLogger } from '@/lib/logger'
import type { GoalRow, NoteRow } from '@/lib/supabase/types'

const logger = createLogger('GoalNotesModal')

const AUTOSAVE_DELAY_MS = 1500

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface GoalNotesModalProps {
  goal: GoalRow
  onClose: () => void
}

const TYPE_ACCENT: Record<GoalRow['goal_type'], string> = {
  skill: '#00d4ff',
  knowledge: '#a855f7',
}

export function GoalNotesModal({ goal, onClose }: GoalNotesModalProps) {
  const [note, setNote] = useState<NoteRow | null>(null)
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [mounted, setMounted] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  const accentColor = TYPE_ACCENT[goal.goal_type]
  const notePath = `goals/${goal.id}/goal.md`

  // Load or create the goal note on mount
  useEffect(() => {
    async function loadNote() {
      try {
        const titleParam = encodeURIComponent(`${goal.title} — Notes`)
        const res = await fetch(
          `/api/notes/goal/${goal.id}?title=${titleParam}`
        )
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          logger.error('Failed to load goal note', {
            goalId: goal.id,
            status: res.status,
            error: err.error,
          })
          return
        }
        const data = (await res.json()) as { note: NoteRow }
        setNote(data.note)
        setContent(data.note.content)
        logger.debug('GoalNotes opened', { goalId: goal.id, noteId: data.note.id })
      } catch (err) {
        logger.error('GoalNotes load error', {
          goalId: goal.id,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadNote()
  }, [goal.id, goal.title])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const saveContent = useCallback(
    async (newContent: string, noteId: string) => {
      logger.debug('GoalNotes autosave', { noteId, contentLength: newContent.length })
      setSaveStatus('saving')

      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent }),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          logger.error('GoalNotes autosave failed', {
            noteId,
            status: res.status,
            error: err.error,
          })
          setSaveStatus('error')
        } else {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      } catch (err) {
        logger.error('GoalNotes autosave network error', {
          noteId,
          error: err instanceof Error ? err.message : String(err),
        })
        setSaveStatus('error')
      }
    },
    []
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value
      setContent(newContent)

      if (!note) return

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(
        () => saveContent(newContent, note.id),
        AUTOSAVE_DELAY_MS
      )
    },
    [note, saveContent]
  )

  const statusText: Record<SaveStatus, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }

  const statusColor: Record<SaveStatus, string> = {
    idle: 'transparent',
    saving: 'rgba(255,255,255,0.3)',
    saved: 'rgba(255,255,255,0.5)',
    error: '#ec4899',
  }

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

      {/* Static outer div handles positioning; motion.div handles animation only */}
      <div
        style={{
          position: 'fixed',
          top: '5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90vw',
          maxWidth: '800px',
          height: '88vh',
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Save status */}
            <span
              style={{
                fontFamily: 'Cormorant, serif',
                fontSize: '0.75rem',
                color: statusColor[saveStatus],
                transition: 'color 0.2s ease',
              }}
            >
              {statusText[saveStatus]}
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
        </div>

        {/* Note path (read-only label) */}
        {note && (
          <div
            style={{
              padding: '0.5rem 1.25rem',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.6rem',
              letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.2)',
              flexShrink: 0,
            }}
          >
            {notePath}
          </div>
        )}

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {isLoading ? (
            <div
              style={{
                height: '100%',
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
          ) : (
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="Write your notes in Markdown…"
              spellCheck={false}
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                padding: '1.5rem 1.25rem',
                fontFamily: 'Cormorant, serif',
                fontSize: '0.9375rem',
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.85)',
                caretColor: accentColor,
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>
      </motion.div>
      </div>
    </>,
    document.body
  )
}
